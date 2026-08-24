# Azure Federated Auth

Three workload identity federation tasks. Each turns an OIDC token issued for an AzureRM service
connection into credentials for a different consumer, without any stored secret. Each task requests
its own OIDC token, so they are independent and can be combined in one job - for example to
authenticate Terraform's `azurerm` provider and backend and its `google` provider at once.

All three require `System.AccessToken` to be available to the job.

## AzureFederatedAuth@2

Publishes the OIDC token as the assertion Terraform's `azurerm` provider exchanges on its own.

- inputs: `serviceConnection`, `printTokenHashes`
- sets: `ARM_OIDC_TOKEN` (secret), `ARM_TENANT_ID`, `ARM_CLIENT_ID`

`AzureFederatedAuth@1` is the Azure-only predecessor. It is frozen.

## AzureScopedAccessToken@1

Exchanges the OIDC token for a Microsoft Entra access token for the requested resource, for
consumers such as `git` that cannot perform the exchange themselves.

- inputs: `serviceConnection`, `scope`, `accessTokenVariable`, `printTokenHashes`
- sets: the variable named by `accessTokenVariable` (secret)

## GoogleFederatedAuth@1

Exchanges the OIDC token at the Google Cloud Security Token Service, optionally impersonating a
service account. A configured workload identity pool, OIDC provider and IAM binding are a
prerequisite.

- inputs: `serviceConnection`, `gcpWorkloadIdentityProvider`, `gcpServiceAccountEmail`,
  `gcpProjectId`, `gcpRegion`, `gcpScopes`, `gcpAccessTokenVariable`, `gcpTokenLifetimeSeconds`,
  `gcpStsTokenUrl`, `printOidcClaims`, `printTokenHashes`
- sets: the variable named by `gcpAccessTokenVariable`, by default `GOOGLE_OAUTH_ACCESS_TOKEN`
  (secret), `GOOGLE_CLOUD_PROJECT`, `GOOGLE_REGION`, `GCP_ACCESS_TOKEN_EXPIRY`

Token variables are secret, so later steps map them with `env:` under the name the consuming tool
expects. For examples, including the Azure DevOps Git access token, see the project README.
