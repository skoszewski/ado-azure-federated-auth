import * as crypto from 'node:crypto';
import * as tl from 'azure-pipelines-task-lib/task.js';
import {
  buildOidcUrl,
  getServiceConnectionMetadata,
  requestOidcToken
} from '../../../shared/src/oidc.js';

async function run(): Promise<void> {
  try {
    const endpointId = tl.getInputRequired('serviceConnection');
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

    const requestUrl = buildOidcUrl(oidcBaseUrl, endpointId);
    const armToken = await requestOidcToken(requestUrl, accessToken);
    const metadata = getServiceConnectionMetadata(endpointId);

    tl.setVariable('ARM_OIDC_TOKEN', armToken, true);
    tl.setVariable('ARM_TENANT_ID', metadata.tenantId);
    tl.setVariable('ARM_CLIENT_ID', metadata.clientId);

    console.log('Successfully retrieved OIDC token.');
    if (printTokenHashes) {
      const armTokenHash = crypto.createHash('sha256').update(armToken).digest('hex');
      console.log(`OIDC Token SHA256: ${armTokenHash}`);
    }

    tl.setResult(tl.TaskResult.Succeeded, 'ARM OIDC variables configured.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `Failed to configure ARM OIDC variables: ${message}`);
  }
}

void run();
