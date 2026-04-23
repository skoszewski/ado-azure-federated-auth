import * as crypto from 'node:crypto';
import * as tl from 'azure-pipelines-task-lib/task.js';
import {
  buildOidcUrl,
  exchangeOidcForScopedToken,
  getServiceConnectionMetadata,
  requestOidcToken
} from './oidc.js';

const AZDO_APP_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';

async function run(): Promise<void> {
  try {
    const armEndpointId = tl.getInputRequired('serviceConnectionARM');
    const setGitAccessToken = tl.getBoolInput('setGitAccessToken', false);
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

    if (setGitAccessToken) {
      let gitOidcToken = armToken;
      let gitMetadata = armMetadata;

      if (gitEndpointId !== undefined && gitEndpointId.length > 0 && gitEndpointId !== armEndpointId) {
        console.log('Requesting OIDC token for Git service connection...');
        const gitRequestUrl = buildOidcUrl(oidcBaseUrl, gitEndpointId);
        gitOidcToken = await requestOidcToken(gitRequestUrl, accessToken);
        gitMetadata = getServiceConnectionMetadata(gitEndpointId);
      }

      console.log('Exchanging OIDC token for Azure DevOps scoped Git access token...');
      const gitToken = await exchangeOidcForScopedToken(gitMetadata.tenantId, gitMetadata.clientId, gitOidcToken, AZDO_APP_SCOPE);
      tl.setVariable('GIT_ACCESS_TOKEN', gitToken, true);
      if (printTokenHashes) {
        const gitTokenHash = crypto.createHash('sha256').update(gitToken).digest('hex');
        console.log(`GIT Access Token SHA256: ${gitTokenHash}`);
      }
    }

    tl.setResult(tl.TaskResult.Succeeded, 'ARM OIDC variables configured.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `Failed to configure ARM OIDC variables: ${message}`);
  }
}

void run();
