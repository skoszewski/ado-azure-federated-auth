#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
TASK_DIR="$ROOT_DIR/task/AzureFederatedAuth"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 24 LTS is required."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -ne 24 ]]; then
  echo "Node.js 24 LTS is required. Current version: $(node -v)"
  exit 1
fi

mkdir -p "$BUILD_DIR"

cd "$ROOT_DIR"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install --no-audit --fund=false
fi

rm -rf "$TASK_DIR/dist" "$TASK_DIR/node_modules"
npm install --prefix "$TASK_DIR" --no-audit --fund=false --no-package-lock --no-save azure-pipelines-task-lib@5.2.8

npx tsc -p "$ROOT_DIR/tsconfig.json"

npx tfx-cli extension create \
  --manifest-globs vss-extension.json \
  --output-path "$BUILD_DIR"
