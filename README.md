# Azure Federated Auth Azure DevOps Extension

Azure DevOps extension containing the `AzureFederatedAuth` task.

## Task versions

| Version | Scope |
| --- | --- |
| `AzureFederatedAuth@1` | Azure only. Frozen; no further changes. |
| `AzureFederatedAuth@2` | Everything in `@1`, plus optional Google Cloud workload identity federation. |

All `@1` inputs behave identically in `@2`, so migrating is a matter of changing `@1` to `@2`.

## Task

The AzureFederatedAuth task requests an OIDC token for a selected AzureRM service connection and
sets pipeline variables for downstream tasks. It can be directly used by Terraform and other tools
supporting OIDC-based authentication with Azure.

Version 2 additionally exchanges the same OIDC token at the Google Cloud Security Token Service,
so a single job can authenticate Terraform's `azurerm` provider and backend *and* its `google`
provider without any stored credentials.

### Inputs

- `serviceConnectionARM`: AzureRM service connection used for ARM OIDC (required)
- `serviceConnectionGit`: AzureRM service connection used to acquire the Git access token; when set, `GIT_ACCESS_TOKEN` is exported (optional)
- `printTokenHashes`: Print SHA256 hashes of issued tokens to the log (optional)

Google Cloud inputs (version 2 only, all optional):

- `gcpWorkloadIdentityProvider`: Workload identity pool provider resource name,
  `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>`,
  optionally prefixed with `//iam.googleapis.com/`. Use the project **number**, not the project ID.
  Setting this input enables the Google Cloud token exchange; leaving it empty skips it entirely.
- `gcpServiceAccountEmail`: Service account to impersonate. When empty, the federated token is
  exported directly (direct resource access).
- `gcpProjectId`: Default project, exported as `GOOGLE_CLOUD_PROJECT` and `CLOUDSDK_CORE_PROJECT`.
- `gcpRegion`: Default region, exported as `GOOGLE_REGION`.
- `gcpScopes`: OAuth scopes, whitespace or comma separated. Defaults to
  `https://www.googleapis.com/auth/cloud-platform`.
- `gcpTokenLifetimeSeconds`: Lifetime of the impersonated token. Defaults to the API default of
  3600.
- `gcpStsTokenUrl`: Security Token Service endpoint. Change only to target a regional endpoint.
- `printOidcClaims`: Print the `iss`, `aud`, `sub` and `exp` claims of the OIDC token. No secret
  material is printed.

### Exports

- `ARM_OIDC_TOKEN` (secret)
- `ARM_TENANT_ID`
- `ARM_CLIENT_ID`
- `GIT_ACCESS_TOKEN` (secret, optional)

Version 2, when `gcpWorkloadIdentityProvider` is set:

- `GOOGLE_OAUTH_ACCESS_TOKEN` (secret) - read by the Terraform `google` / `google-beta` provider
  as its `access_token`
- `CLOUDSDK_AUTH_ACCESS_TOKEN` (secret) - read by `gcloud`
- `GOOGLE_CLOUD_PROJECT`, `CLOUDSDK_CORE_PROJECT` (when `gcpProjectId` is set)
- `GOOGLE_REGION` (when `gcpRegion` is set)
- `GCP_ACCESS_TOKEN_EXPIRY` - ISO 8601 expiry of the exported Google token

A configured Google Cloud workload identity pool, OIDC provider and IAM binding are a prerequisite
for the version 2 inputs. That setup is out of scope for this repository. `printOidcClaims` prints
the `iss`, `aud` and `sub` values the provider has to be configured with.

## Terraform usage

The following example shows a Terraform job that uses the AzureFederatedAuth task to authenticate
both the `azurerm` and `google` providers with a single AzureRM service connection.

```yaml
- task: AzureFederatedAuth@2
  inputs:
    serviceConnectionARM: my-arm-connection
    gcpWorkloadIdentityProvider: projects/123456789/locations/global/workloadIdentityPools/azure-devops/providers/azure-devops-oidc
    gcpServiceAccountEmail: terraform@my-project.iam.gserviceaccount.com
    gcpProjectId: my-project
    gcpRegion: europe-west1

- script: |
    terraform init
    terraform apply -auto-approve
  env:
    ARM_OIDC_TOKEN: $(ARM_OIDC_TOKEN)
    GOOGLE_OAUTH_ACCESS_TOKEN: $(GOOGLE_OAUTH_ACCESS_TOKEN)
```

> **Note**: Exported token variables are secret, so Azure DevOps does not map them into the environment of
> later steps automatically - pass them explicitly with `env:`, exactly as `ARM_OIDC_TOKEN` already
> requires. Non-secret variables such as `GOOGLE_CLOUD_PROJECT` and `GOOGLE_REGION` need no mapping,
> and supply the provider's `project` and `region` when the provider block leaves them unset.

## Build

Prerequisites:

- Node.js 24 LTS
- npm

Build and package:

```bash
npm run build
```

Other scripts: `npm run clean`, `npm run bump-version -- minor`, `npm run publish-extension`.

## License

MIT. See [LICENSE](LICENSE).
