# Azure Federated Auth

`AzureFederatedAuth` requests an OIDC token for a selected AzureRM service connection and sets
pipeline variables for downstream tasks. It can be directly used by Terraform and other tools
supporting OIDC-based authentication with Azure.

Version 2 additionally exchanges the same OIDC token at the Google Cloud Security Token Service,
so one job can authenticate Terraform's `azurerm` provider and backend and its `google` provider
without any stored credentials.

## Versions

- `AzureFederatedAuth@1`: Azure only. Frozen.
- `AzureFederatedAuth@2`: everything in `@1`, plus optional Google Cloud workload identity
  federation. Migrating is a matter of changing `@1` to `@2`.

## Inputs

- `serviceConnectionARM`: AzureRM service connection used for ARM OIDC (required)
- `serviceConnectionGit`: AzureRM service connection used to acquire the Git access token; when set, `GIT_ACCESS_TOKEN` is set (optional)
- `printTokenHashes`: Print SHA256 hashes of issued tokens to the log (optional)

Google Cloud inputs (version 2 only, all optional):

- `gcpWorkloadIdentityProvider`: workload identity pool provider resource name; setting it enables
  the Google Cloud token exchange
- `gcpServiceAccountEmail`: service account to impersonate
- `gcpProjectId`, `gcpRegion`: defaults for the Terraform google provider and gcloud
- `gcpScopes`, `gcpTokenLifetimeSeconds`, `gcpStsTokenUrl`: token exchange tuning
- `gcpAccessTokenVariable`: name of the secret variable that receives the access token; defaults to
  `GOOGLE_OAUTH_ACCESS_TOKEN`
- `printOidcClaims`: print the OIDC token's `aud` and `exp` claims

## Pipeline variables set

- `ARM_OIDC_TOKEN` (secret)
- `ARM_TENANT_ID`
- `ARM_CLIENT_ID`
- `GIT_ACCESS_TOKEN` (secret, optional)

Version 2, when `gcpWorkloadIdentityProvider` is set:

- the variable named by `gcpAccessTokenVariable` (secret), by default `GOOGLE_OAUTH_ACCESS_TOKEN`
- `GOOGLE_CLOUD_PROJECT`, `CLOUDSDK_CORE_PROJECT`, `GOOGLE_REGION`
- `GCP_ACCESS_TOKEN_EXPIRY`

For a Terraform example, see the project README.
