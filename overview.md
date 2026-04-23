# Azure Federated Auth

`AzureFederatedAuth@1` requests an OIDC token for a selected AzureRM service connection and sets pipeline variables for downstream tasks.
It can be directly used by Terraform and other tools supporting OIDC-based authentication with Azure.

## Inputs

- `serviceConnectionARM`: AzureRM service connection used for ARM OIDC (required)
- `serviceConnectionGit`: AzureRM service connection used to acquire the Git access token; when set, `GIT_ACCESS_TOKEN` is exported (optional)
- `printTokenHashes`: Print SHA256 hashes of issued tokens to the log (optional)

## Exports

- `ARM_OIDC_TOKEN` (secret)
- `ARM_TENANT_ID`
- `ARM_CLIENT_ID`
- `GIT_ACCESS_TOKEN` (secret, optional)
