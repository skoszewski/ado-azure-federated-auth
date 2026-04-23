#!/usr/bin/env bash
# AZDO_PAT requirements (created in Azure DevOps user settings > Personal Access Tokens):
#   - Scopes: Marketplace > Manage (or at minimum Publish, vso.gallery_publish) —
#     covers publishing the extension and sharing it via --share-with.
#   - Organization (dropdown at top of the New Token dialog): any value works
#     (All accessible organizations, or a specific one) — Marketplace scopes
#     grant access to marketplace.visualstudio.com independently of this choice.
#   - Created under the publisher identity that owns PUBLISHER_ID.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

set -a
source "$ROOT_DIR/.env"
set +a

if [[ -z "${AZDO_PAT:-}" ]]; then
  echo "AZDO_PAT is not set."
  exit 1
fi

if [[ -z "${PUBLISHER_ID:-}" || -z "${EXTENSION_ID:-}" || -z "${EXTENSION_VERSION:-}" || -z "${ORG:-}" ]]; then
  echo "PUBLISHER_ID, EXTENSION_ID, EXTENSION_VERSION and ORG must be set in .env"
  exit 1
fi

VSIX_PATH="$ROOT_DIR/build/${PUBLISHER_ID}.${EXTENSION_ID}-${EXTENSION_VERSION}.vsix"

if [[ ! -f "$VSIX_PATH" ]]; then
  echo "VSIX file not found at path: $VSIX_PATH"
  exit 1
fi

echo "Publishing to organization: $ORG"
npx tfx-cli extension publish \
  --vsix "$VSIX_PATH" \
  --publisher "$PUBLISHER_ID" \
  --token "$AZDO_PAT" \
  --share-with "$ORG"
