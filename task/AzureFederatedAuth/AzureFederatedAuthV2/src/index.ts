import * as crypto from 'node:crypto';
import * as tl from 'azure-pipelines-task-lib/task.js';
import {
  buildOidcUrl,
  exchangeOidcForScopedToken,
  getServiceConnectionMetadata,
  requestOidcToken
} from './oidc.js';
import {
  CLOUD_PLATFORM_SCOPE,
  DEFAULT_STS_TOKEN_URL,
  buildProviderAudience,
  decodeJwtClaims,
  exchangeOidcForFederatedToken,
  impersonateServiceAccount,
  parseScopes
} from './gcp.js';

const AZDO_APP_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

function printClaims(oidcToken: string): void {
  const claims = decodeJwtClaims(oidcToken);
  const audience = Array.isArray(claims.aud) ? claims.aud.join(', ') : claims.aud;
  const expiry = claims.exp === undefined ? undefined : new Date(claims.exp * 1000).toISOString();

  console.log('OIDC token claims (use these to configure the Google workload identity provider):');
  console.log(`  iss (--issuer-uri):       ${claims.iss ?? '<missing>'}`);
  console.log(`  aud (--allowed-audiences): ${audience ?? '<missing>'}`);
  console.log(`  sub (federation subject):  ${claims.sub ?? '<missing>'}`);
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

async function configureGoogleCloud(oidcToken: string, printTokenHashes: boolean): Promise<boolean> {
  const providerResourceName = tl.getInput('gcpWorkloadIdentityProvider', false);

  if (providerResourceName === undefined || providerResourceName.trim().length === 0) {
    console.log('gcpWorkloadIdentityProvider not set - Google Cloud variables will not be exported.');
    return false;
  }

  const serviceAccountEmail = (tl.getInput('gcpServiceAccountEmail', false) ?? '').trim();
  const projectId = (tl.getInput('gcpProjectId', false) ?? '').trim();
  const region = (tl.getInput('gcpRegion', false) ?? '').trim();
  const stsTokenUrl = (tl.getInput('gcpStsTokenUrl', false) ?? '').trim() || DEFAULT_STS_TOKEN_URL;
  const requestedScopes = parseScopes(tl.getInput('gcpScopes', false));
  const lifetimeSeconds = readLifetimeSeconds();

  const audience = buildProviderAudience(providerResourceName);
  const impersonate = serviceAccountEmail.length > 0;

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

  tl.setVariable('GOOGLE_OAUTH_ACCESS_TOKEN', googleToken, true);
  tl.setVariable('CLOUDSDK_AUTH_ACCESS_TOKEN', googleToken, true);

  if (projectId.length > 0) {
    tl.setVariable('GOOGLE_CLOUD_PROJECT', projectId);
    tl.setVariable('CLOUDSDK_CORE_PROJECT', projectId);
  }

  if (region.length > 0) {
    tl.setVariable('GOOGLE_REGION', region);
  }

  if (expiry !== undefined) {
    tl.setVariable('GCP_ACCESS_TOKEN_EXPIRY', expiry);
    console.log(`Google Cloud access token expires at ${expiry}.`);
  }

  console.log('Successfully retrieved Google Cloud access token.');
  if (printTokenHashes) {
    const googleTokenHash = crypto.createHash('sha256').update(googleToken).digest('hex');
    console.log(`Google Cloud Access Token SHA256: ${googleTokenHash}`);
  }

  return true;
}

async function run(): Promise<void> {
  try {
    const armEndpointId = tl.getInputRequired('serviceConnectionARM');
    const gitEndpointId = tl.getInput('serviceConnectionGit', false);
    const printTokenHashes = tl.getBoolInput('printTokenHashes', false);

    const oidcBaseUrl = tl.getVariable('System.OidcRequestUri');
    const accessToken = tl.getVariable('System.AccessToken');

    if (oidcBaseUrl === undefined) {
      throw new Error('Missing required pipeline variable: System.OidcRequestUri.');
    }

    if (accessToken === undefined) {
      throw new Error('Missing required pipeline variable: System.AccessToken.');
    }

    console.log('Requesting OIDC token for ARM authentication...');

    const armRequestUrl = buildOidcUrl(oidcBaseUrl, armEndpointId);
    const armToken = await requestOidcToken(armRequestUrl, accessToken);
    const armMetadata = getServiceConnectionMetadata(armEndpointId);

    tl.setVariable('ARM_OIDC_TOKEN', armToken, true);
    tl.setVariable('ARM_TENANT_ID', armMetadata.tenantId);
    tl.setVariable('ARM_CLIENT_ID', armMetadata.clientId);

    console.log('Successfully retrieved OIDC token.');
    if (printTokenHashes) {
      const armTokenHash = crypto.createHash('sha256').update(armToken).digest('hex');
      console.log(`OIDC Token SHA256: ${armTokenHash}`);
    }

    if (gitEndpointId === undefined || gitEndpointId.length === 0) {
      console.log('serviceConnectionGit not set - GIT_ACCESS_TOKEN will not be exported.');
    } else {
      console.log('Requesting OIDC token for Git service connection...');
      const gitRequestUrl = buildOidcUrl(oidcBaseUrl, gitEndpointId);
      const gitOidcToken = await requestOidcToken(gitRequestUrl, accessToken);
      const gitMetadata = getServiceConnectionMetadata(gitEndpointId);

      console.log('Exchanging OIDC token for Azure DevOps scoped Git access token...');
      const gitToken = await exchangeOidcForScopedToken(gitMetadata.tenantId, gitMetadata.clientId, gitOidcToken, AZDO_APP_SCOPE);
      tl.setVariable('GIT_ACCESS_TOKEN', gitToken, true);
      if (printTokenHashes) {
        const gitTokenHash = crypto.createHash('sha256').update(gitToken).digest('hex');
        console.log(`GIT Access Token SHA256: ${gitTokenHash}`);
      }
    }

    const googleConfigured = await configureGoogleCloud(armToken, printTokenHashes);

    const summary = googleConfigured
      ? 'ARM OIDC and Google Cloud variables configured.'
      : 'ARM OIDC variables configured.';

    tl.setResult(tl.TaskResult.Succeeded, summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `Failed to configure federated auth variables: ${message}`);
  }
}

void run();
