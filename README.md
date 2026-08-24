# Azure Federated Auth Azure DevOps Extension

Azure DevOps extension containing three workload identity federation tasks and one helper. Each
federation task turns an OIDC token issued for an AzureRM service connection into credentials for a
different consumer, and each requests its own OIDC token, so they are independent and can be used in
any combination.

| Task | Purpose |
| --- | --- |
| `AzureFederatedAuth@2` | ARM OIDC token and the connection's tenant and client id |
| `AzureScopedAccessToken@1` | Microsoft Entra access token for a requested resource |
| `GoogleFederatedAuth@1` | Google Cloud access token through workload identity federation |
| `CreateGitAskPassScript@1` | git credential helper that feeds an access token to git |

`AzureFederatedAuth@1` is the Azure-only predecessor of `@2`. It is frozen and receives no further
changes.

The three federation tasks require `System.AccessToken` to be available to the job.

## AzureFederatedAuth

Requests an OIDC token and publishes it as the assertion that Terraform's `azurerm` provider and
backend exchange on their own.

### Inputs

- `serviceConnection`: AzureRM service connection used for ARM OIDC (required)
- `printTokenHashes`: Print the SHA256 hash of the issued token to the log (optional)

### Pipeline variables set

- `ARM_OIDC_TOKEN` (secret)
- `ARM_TENANT_ID`
- `ARM_CLIENT_ID`

## AzureScopedAccessToken

Exchanges the OIDC token for a Microsoft Entra access token, for consumers that cannot perform the
exchange themselves. The identity is the app registration behind the service connection, and it
needs access to the requested resource.

### Inputs

- `serviceConnection`: AzureRM service connection used for the OIDC token (required)
- `scope`: Resource scope of the token, for example `https://graph.microsoft.com/.default`. The
  client credentials flow issues application scopes, so the value ends with `/.default` (required)
- `accessTokenVariable`: Name of the secret variable that receives the token. The name may contain
  letters, digits, `.` and `_`, and must not start with the reserved prefixes `endpoint`, `input`,
  `secret`, `path` or `securefile` (required)
- `printTokenHashes`: Print the SHA256 hash of the issued token to the log (optional)

### Pipeline variables set

- the variable named by `accessTokenVariable` (secret)

### Azure DevOps Git access token

Cloning an Azure Repos repository is the case worth spelling out. The Azure DevOps resource ID is
`499b84ac-1321-427f-aa17-267ca6975798` - the same ID that
`az account get-access-token --resource` takes - so the scope is that GUID with the `/.default`
suffix. The identity behind the service connection needs access to the repository, granted like any
other Azure DevOps user or service principal.

```yaml
- task: AzureScopedAccessToken@1
  inputs:
    serviceConnection: my-arm-connection
    scope: 499b84ac-1321-427f-aa17-267ca6975798/.default
    accessTokenVariable: GIT_ACCESS_TOKEN

- script: |
    git -c http.extraheader="AUTHORIZATION: bearer $GIT_ACCESS_TOKEN" \
      clone https://dev.azure.com/my-org/my-project/_git/my-repo
  env:
    GIT_ACCESS_TOKEN: $(GIT_ACCESS_TOKEN)
```

`git` takes the token as a bearer header rather than as a credential. For repeated Git commands the
same header goes into the configuration once:

```bash
git config --global http.https://dev.azure.com/my-org/.extraheader "AUTHORIZATION: bearer $GIT_ACCESS_TOKEN"
```

## GoogleFederatedAuth

Exchanges the OIDC token at the Google Cloud Security Token Service, optionally impersonating a
service account. The AzureRM service connection here is the OIDC issuer that the Google workload
identity provider trusts, not a Google Cloud credential.

A configured Google Cloud workload identity pool, OIDC provider and IAM binding are a prerequisite.
That setup is out of scope for this repository. `printOidcClaims` prints the `aud` value the
provider's `--allowed-audiences` has to be configured with.

### Inputs

- `serviceConnection`: AzureRM service connection used for the OIDC token (required)
- `gcpWorkloadIdentityProvider`: Workload identity pool provider resource name,
  `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>`,
  optionally prefixed with `//iam.googleapis.com/`. Use the project **number**, not the project ID
  (required)
- `gcpServiceAccountEmail`: Service account to impersonate. When empty, the federated token is used
  directly (direct resource access).
- `gcpProjectId`: Default project, set as `GOOGLE_CLOUD_PROJECT`.
- `gcpRegion`: Default region, set as `GOOGLE_REGION`.
- `gcpScopes`: OAuth scopes, whitespace or comma separated. Defaults to
  `https://www.googleapis.com/auth/cloud-platform`.
- `gcpAccessTokenVariable`: Name of the secret variable that receives the access token. Defaults to
  `GOOGLE_OAUTH_ACCESS_TOKEN`, and follows the same naming rules as `accessTokenVariable` above.
- `gcpTokenLifetimeSeconds`: Lifetime of the impersonated token. Defaults to the API default of
  3600.
- `gcpStsTokenUrl`: Security Token Service endpoint. Change only to target a regional endpoint.
- `printOidcClaims`: Print the `aud` and `exp` claims of the OIDC token.
- `printTokenHashes`: Print the SHA256 hash of the issued token to the log.

### Pipeline variables set

- the variable named by `gcpAccessTokenVariable` (secret), by default `GOOGLE_OAUTH_ACCESS_TOKEN`
- `GOOGLE_CLOUD_PROJECT` (when `gcpProjectId` is set) - read by the Terraform `google` provider and
  by the Google Cloud client libraries as the default project
- `GOOGLE_REGION` (when `gcpRegion` is set)
- `GCP_ACCESS_TOKEN_EXPIRY` - ISO 8601 expiry of the Google Cloud access token

`gcloud` reads its token and project from `CLOUDSDK_AUTH_ACCESS_TOKEN` and `CLOUDSDK_CORE_PROJECT`;
map them in the step that runs it.

## CreateGitAskPassScript

Writes a credential helper script and sets `GIT_ASKPASS` to its path. It is the first of the four
strategies git uses to ask for usernames and passwords: the program named by `GIT_ASKPASS` is
invoked with the prompt as its command-line argument and the answer is read from its standard
output. The script here ignores the prompt and prints one environment variable, so the same value
answers both the username and the password prompt, which is what Azure Repos expects - the username
may be anything except an empty string.

No token is written to disk or into a git configuration file; the step that runs git supplies the
value with `env:`. `GIT_ASKPASS` is not secret, so later steps inherit it without mapping. On a
Windows agent the script is a `.cmd` file; elsewhere it is a bash script with mode 700.

### Inputs

- `tokenEnvironmentVariable`: Name of the environment variable the script prints. Defaults to
  `GIT_ACCESS_TOKEN` (optional)
- `scriptPath`: Where to write the script. Defaults to `git-ask-pass` in `$(Pipeline.Workspace)`,
  with a `.cmd` extension on Windows (optional)

### Pipeline variables set

- `GIT_ASKPASS` - path of the generated script

### Usage with a federated token

```yaml
- task: AzureScopedAccessToken@1
  inputs:
    serviceConnection: my-arm-connection
    scope: 499b84ac-1321-427f-aa17-267ca6975798/.default
    accessTokenVariable: GIT_ACCESS_TOKEN

- task: CreateGitAskPassScript@1

- script: |
    git clone https://dev.azure.com/my-org/my-project/_git/my-repo
    git -C my-repo push
  env:
    GIT_ACCESS_TOKEN: $(GIT_ACCESS_TOKEN)
```

`GIT_ASKPASS` is an environment variable, so it applies to every git command in the step and to the
git processes those commands start, where the `http.extraheader` form has to be repeated per
command or written into the configuration.

## Terraform usage

The following example authenticates both the `azurerm` and `google` providers from a single AzureRM
service connection.

```yaml
- task: AzureFederatedAuth@2
  inputs:
    serviceConnection: my-arm-connection

- task: GoogleFederatedAuth@1
  inputs:
    serviceConnection: my-arm-connection
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

> **Note**: The token variables are secret, so Azure DevOps does not map them into the environment of
> later steps automatically - pass them explicitly with `env:`. Non-secret variables such as
> `GOOGLE_CLOUD_PROJECT` and `GOOGLE_REGION` need no mapping, and supply the provider's `project`
> and `region` when the provider block leaves them unset.

## Repository layout

```
task/
  shared/                       sources imported by more than one task
  AzureFederatedAuth/
    AzureFederatedAuthV1/
    AzureFederatedAuthV2/
  AzureScopedAccessToken/
    AzureScopedAccessTokenV1/
  GoogleFederatedAuth/
    GoogleFederatedAuthV1/
  CreateGitAskPassScript/
    CreateGitAskPassScriptV1/
```

Each task version folder is self-contained once built: its own `task.json`, `package.json`,
`node_modules`, `icon.png` and `dist`. The shared sources are compiled into every task's own `dist`,
which is why the execution targets are nested paths.

## Build

Prerequisites:

- Node.js 24 LTS
- npm

Build and package:

```bash
npm run build
```

Other scripts: `npm run clean`, `npm run publish-extension`, and `npm run bump-version`, which
takes an optional `--component`/`-c` list and a release type:

```bash
npm run bump-version -- minor
npm run bump-version -- -c task-v2 patch
npm run bump-version -- --component task-v2,extension minor
```

Components are `extension`, `task-v1`, `task-v2`, `scoped-v1`, `askpass-v1` and `google-v1`; omitting
the flag bumps all of them. The release type defaults to `patch`. A task's Major is never changed by the
script - it is the task's public contract (`AzureFederatedAuth@2`, `AzureScopedAccessToken@1`) - so
a `major` release type gives tasks a minor bump.

## License

MIT. See [LICENSE](LICENSE).
