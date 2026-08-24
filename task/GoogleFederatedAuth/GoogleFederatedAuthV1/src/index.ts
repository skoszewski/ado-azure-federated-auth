import * as crypto from 'node:crypto';
import * as tl from 'azure-pipelines-task-lib/task.js';
import { buildOidcUrl, requestOidcToken } from '../../../shared/src/oidc.js';
import { readVariableNameInput } from '../../../shared/src/variables.js';
import {
  CLOUD_PLATFORM_SCOPE,
  DEFAULT_STS_TOKEN_URL,
  buildProviderAudience,
  decodeJwtClaims,
  exchangeOidcForFederatedToken,
  impersonateServiceAccount,
  parseScopes
} from './gcp.js';

const DEFAULT_ACCESS_TOKEN_VARIABLE = 'GOOGLE_OAUTH_ACCESS_TOKEN';

function printClaims(oidcToken: string): void {
  const claims = decodeJwtClaims(oidcToken);
  const audience = Array.isArray(claims.aud) ? claims.aud.join(', ') : claims.aud;
  const expiry = claims.exp === undefined ? undefined : new Date(claims.exp * 1000).toISOString();

  console.log('OIDC token claims (use these to configure the Google workload identity provider):');
  console.log(`  aud (--allowed-audiences): ${audience ?? '<missing>'}`);
  console.log(`  exp:                       ${expiry ?? '<missing>'}`);
}

function readLifetimeSeconds(): number | undefined {
  const raw = tl.getInput('gcpTokenLifetimeSeconds', false);

  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`gcpTokenLifetimeSeconds must be a positive integer. Received: ${raw}`);
  }

  return parsed;
}

async function run(): Promise<void> {
  try {
    const endpointId = tl.getInputRequired('serviceConnection');
    const providerResourceName = tl.getInputRequired('gcpWorkloadIdentityProvider');
    const serviceAccountEmail = (tl.getInput('gcpServiceAccountEmail', false) ?? '').trim();
    const projectId = (tl.getInput('gcpProjectId', false) ?? '').trim();
    const region = (tl.getInput('gcpRegion', false) ?? '').trim();
    const stsTokenUrl = (tl.getInput('gcpStsTokenUrl', false) ?? '').trim() || DEFAULT_STS_TOKEN_URL;
    const requestedScopes = parseScopes(tl.getInput('gcpScopes', false));
    const lifetimeSeconds = readLifetimeSeconds();
    const accessTokenVariable = readVariableNameInput(
      'gcpAccessTokenVariable',
      DEFAULT_ACCESS_TOKEN_VARIABLE
    );
    const printTokenHashes = tl.getBoolInput('printTokenHashes', false);

    const oidcBaseUrl = tl.getVariable('System.OidcRequestUri');
    const accessToken = tl.getVariable('System.AccessToken');

    if (oidcBaseUrl === undefined) {
      throw new Error('Missing required pipeline variable: System.OidcRequestUri.');
    }

    if (accessToken === undefined) {
      throw new Error('Missing required pipeline variable: System.AccessToken.');
    }

    const audience = buildProviderAudience(providerResourceName);
    const impersonate = serviceAccountEmail.length > 0;

    console.log('Requesting OIDC token for the selected service connection...');

    const requestUrl = buildOidcUrl(oidcBaseUrl, endpointId);
    const oidcToken = await requestOidcToken(requestUrl, accessToken);

    if (tl.getBoolInput('printOidcClaims', false)) {
      printClaims(oidcToken);
    }

    console.log(`Exchanging OIDC token for a Google Cloud access token (audience: ${audience})...`);

    // When impersonating, the federated token only needs to call the IAM Credentials API;
    // the requested scopes are applied to the impersonated token instead.
    const federated = await exchangeOidcForFederatedToken({
      audience,
      oidcToken,
      tokenUrl: stsTokenUrl,
      scopes: impersonate ? [CLOUD_PLATFORM_SCOPE] : requestedScopes
    });

    tl.setSecret(federated.accessToken);

    let googleToken = federated.accessToken;
    let expiry =
      federated.expiresIn === undefined
        ? undefined
        : new Date(Date.now() + federated.expiresIn * 1000).toISOString();

    if (impersonate) {
      console.log(`Impersonating service account ${serviceAccountEmail}...`);
      const impersonated = await impersonateServiceAccount({
        federatedToken: federated.accessToken,
        serviceAccountEmail,
        scopes: requestedScopes,
        lifetimeSeconds
      });

      googleToken = impersonated.accessToken;
      expiry = impersonated.expireTime ?? expiry;
    }

    tl.setVariable(accessTokenVariable, googleToken, true);

    if (projectId.length > 0) {
      tl.setVariable('GOOGLE_CLOUD_PROJECT', projectId);
    }

    if (region.length > 0) {
      tl.setVariable('GOOGLE_REGION', region);
    }

    if (expiry !== undefined) {
      tl.setVariable('GCP_ACCESS_TOKEN_EXPIRY', expiry);
      console.log(`Google Cloud access token expires at ${expiry}.`);
    }

    console.log(`Successfully retrieved Google Cloud access token, set as ${accessTokenVariable}.`);
    if (printTokenHashes) {
      const googleTokenHash = crypto.createHash('sha256').update(googleToken).digest('hex');
      console.log(`Google Cloud Access Token SHA256: ${googleTokenHash}`);
    }

    tl.setResult(tl.TaskResult.Succeeded, 'Google Cloud variables configured.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `Failed to configure Google Cloud variables: ${message}`);
  }
}

void run();
