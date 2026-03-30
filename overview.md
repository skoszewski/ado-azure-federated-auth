# Azure Federated Auth

`AzureFederatedAuth@1` requests an OIDC token for a selected AzureRM service connection and sets pipeline variables for downstream tasks.
It can be directly used by Terraform and other tools supporting OIDC-based authentication with Azure.

## Inputs

- `azureSubscription`: AzureRM service connection (required)
- `gitAccessToken`: Export Git access token as `GIT_ACCESS_TOKEN` variable (optional)

## Exports

- `ARM_OIDC_TOKEN` (secret)
- `ARM_TENANT_ID`
- `ARM_CLIENT_ID`
- `GIT_ACCESS_TOKEN` (secret, optional)
