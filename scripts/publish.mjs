#!/usr/bin/env node
// AZDO_PAT requirements (created in Azure DevOps user settings > Personal Access Tokens):
//   - Scopes: Marketplace > Manage (or at minimum Publish, vso.gallery_publish) -
//     covers publishing the extension and sharing it via --share-with.
//   - Organization (dropdown at top of the New Token dialog): any value works
//     (All accessible organizations, or a specific one) - Marketplace scopes
//     grant access to marketplace.visualstudio.com independently of this choice.
//   - Created under the publisher identity that owns PUBLISHER_ID.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_DIR, ROOT_DIR } from './paths.mjs';
import { run } from './run.mjs';
import { fail, readJson } from './util.mjs';

const envPath = join(ROOT_DIR, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const { AZDO_PAT, ORG } = process.env;

if (!AZDO_PAT) {
  fail('AZDO_PAT is not set.');
}

// Read the publisher ID, extension ID and version from the vss-extension.json file.
const manifest = readJson(join(ROOT_DIR, 'vss-extension.json'));
const { id: extensionId, version: extensionVersion, publisher: publisherId } = manifest;

if (!publisherId || !extensionId || !extensionVersion) {
  fail('publisher, id and version must be set in vss-extension.json');
}

if (!ORG) {
  fail('ORG is not set.');
}

const vsixPath = join(BUILD_DIR, `${publisherId}.${extensionId}-${extensionVersion}.vsix`);

if (!existsSync(vsixPath)) {
  fail(`VSIX file not found at path: ${vsixPath}`);
}

console.log(`Publishing to organization: ${ORG}`);
run('npx', [
  'tfx-cli',
  'extension',
  'publish',
  '--vsix',
  vsixPath,
  '--publisher',
  publisherId,
  '--token',
  AZDO_PAT,
  '--share-with',
  ORG
]);
