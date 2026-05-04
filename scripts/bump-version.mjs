#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const VALID_RELEASE_TYPES = new Set(['major', 'minor', 'patch']);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const releaseType = process.argv[2] ?? 'patch';
if (!VALID_RELEASE_TYPES.has(releaseType)) {
  fail(`Invalid release type: ${releaseType}. Allowed values: major, minor, patch.`);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(scriptDir);
const extensionManifestPath = join(rootDir, 'vss-extension.json');
const taskManifestPath = join(rootDir, 'task', 'AzureFederatedAuth', 'task.json');
const rootPackagePath = join(rootDir, 'package.json');
const taskPackagePath = join(rootDir, 'task', 'AzureFederatedAuth', 'package.json');

const extensionManifest = JSON.parse(readFileSync(extensionManifestPath, 'utf8'));
const currentVersion = extensionManifest.version;
if (!semver.valid(currentVersion)) {
  fail(`Invalid extension version in vss-extension.json: ${currentVersion}`);
}

const nextVersion = semver.inc(currentVersion, releaseType);
if (nextVersion == null) {
  fail(`Could not increment version ${currentVersion} with release type ${releaseType}.`);
}

extensionManifest.version = nextVersion;
writeFileSync(extensionManifestPath, `${JSON.stringify(extensionManifest, null, 2)}\n`, 'utf8');

const taskManifest = JSON.parse(readFileSync(taskManifestPath, 'utf8'));
const [major, minor, patch] = nextVersion.split('.').map((segment) => Number.parseInt(segment, 10));

taskManifest.version = {
  Major: major,
  Minor: minor,
  Patch: patch
};

writeFileSync(taskManifestPath, `${JSON.stringify(taskManifest, null, 2)}\n`, 'utf8');

const rootPackage = JSON.parse(readFileSync(rootPackagePath, 'utf8'));
rootPackage.version = nextVersion;
writeFileSync(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`, 'utf8');

const taskPackage = JSON.parse(readFileSync(taskPackagePath, 'utf8'));
taskPackage.version = nextVersion;
writeFileSync(taskPackagePath, `${JSON.stringify(taskPackage, null, 2)}\n`, 'utf8');

console.log(`Bumped version: ${currentVersion} -> ${nextVersion} (${releaseType})`);
