import * as crypto from 'node:crypto';
import * as tl from 'azure-pipelines-task-lib/task.js';
import {
  buildOidcUrl,
  exchangeOidcForScopedToken,
  getServiceConnectionMetadata,
  requestOidcToken
} from '../../../shared/src/oidc.js';
import { readVariableNameInput } from '../../../shared/src/variables.js';

const DEFAULT_SCOPE_SUFFIX = '/.default';

function readScope(): string {
  const scope = tl.getInputRequired('scope').trim();

  if (!scope.endsWith(DEFAULT_SCOPE_SUFFIX)) {
    throw new Error(
      `The client credentials flow issues application scopes only, so scope must end with ` +
        `${DEFAULT_SCOPE_SUFFIX}. Received: ${scope}`
    );
  }

  return scope;
}

async function run(): Promise<void> {
  try {
    const endpointId = tl.getInputRequired('serviceConnection');
    const scope = readScope();
    const accessTokenVariable = readVariableNameInput('accessTokenVariable');
    const printTokenHashes = tl.getBoolInput('printTokenHashes', false);

    const oidcBaseUrl = tl.getVariable('System.OidcRequestUri');
    const accessToken = tl.getVariable('System.AccessToken');

    if (oidcBaseUrl === undefined) {
      throw new Error('Missing required pipeline variable: System.OidcRequestUri.');
    }

    if (accessToken === undefined) {
      throw new Error('Missing required pipeline variable: System.AccessToken.');
    }

    console.log('Requesting OIDC token for the selected service connection...');

    const requestUrl = buildOidcUrl(oidcBaseUrl, endpointId);
    const oidcToken = await requestOidcToken(requestUrl, accessToken);
    const metadata = getServiceConnectionMetadata(endpointId);

    console.log(`Exchanging OIDC token for an access token (scope: ${scope})...`);
    const scopedToken = await exchangeOidcForScopedToken(
      metadata.tenantId,
      metadata.clientId,
      oidcToken,
      scope
    );

    tl.setVariable(accessTokenVariable, scopedToken, true);

    console.log(`Successfully retrieved access token, set as ${accessTokenVariable}.`);
    if (printTokenHashes) {
      const scopedTokenHash = crypto.createHash('sha256').update(scopedToken).digest('hex');
      console.log(`Access Token SHA256: ${scopedTokenHash}`);
    }

    tl.setResult(tl.TaskResult.Succeeded, `${accessTokenVariable} configured.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `Failed to acquire the scoped access token: ${message}`);
  }
}

void run();
