#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';
import { ROOT_DIR, TASK_VERSIONS } from './paths.mjs';

const VALID_RELEASE_TYPES = new Set(['major', 'minor', 'patch']);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const releaseType = process.argv[2] ?? 'patch';
if (!VALID_RELEASE_TYPES.has(releaseType)) {
  fail(`Invalid release type: ${releaseType}. Allowed values: major, minor, patch.`);
}

const extensionManifestPath = join(ROOT_DIR, 'vss-extension.json');
const extensionManifest = readJson(extensionManifestPath);
const currentVersion = extensionManifest.version;

if (!semver.valid(currentVersion)) {
  fail(`Invalid extension version in vss-extension.json: ${currentVersion}`);
}

const nextVersion = semver.inc(currentVersion, releaseType);
if (nextVersion == null) {
  fail(`Could not increment version ${currentVersion} with release type ${releaseType}.`);
}

extensionManifest.version = nextVersion;
writeJson(extensionManifestPath, extensionManifest);

const rootPackagePath = join(ROOT_DIR, 'package.json');
const rootPackage = readJson(rootPackagePath);
rootPackage.version = nextVersion;
writeJson(rootPackagePath, rootPackage);

// Keep the lock file in step so `npm ci` does not see a stale root version.
const rootLockPath = join(ROOT_DIR, 'package-lock.json');
const rootLock = readJson(rootLockPath);
rootLock.version = nextVersion;
if (rootLock.packages?.['']) {
  rootLock.packages[''].version = nextVersion;
}
writeJson(rootLockPath, rootLock);

// Each task version carries its own semver line. The major is the task's public
// contract (AzureFederatedAuth@1, @2) and is only ever changed by hand, so the
// release type is applied to the minor and patch segments only.
for (const task of TASK_VERSIONS) {
  const taskManifestPath = join(task.dir, 'task.json');
  const taskManifest = readJson(taskManifestPath);
  const { Major, Minor, Patch } = taskManifest.version;
  const currentTaskVersion = `${Major}.${Minor}.${Patch}`;

  const bumped = semver.inc(currentTaskVersion, releaseType === 'major' ? 'minor' : releaseType);
  if (bumped == null) {
    fail(`Could not increment ${task.name} version ${currentTaskVersion}.`);
  }

  const [, nextMinor, nextPatch] = bumped.split('.').map((segment) => Number.parseInt(segment, 10));
  taskManifest.version = { Major, Minor: nextMinor, Patch: nextPatch };
  writeJson(taskManifestPath, taskManifest);

  const taskPackagePath = join(task.dir, 'package.json');
  const taskPackage = readJson(taskPackagePath);
  taskPackage.version = `${Major}.${nextMinor}.${nextPatch}`;
  writeJson(taskPackagePath, taskPackage);

  console.log(`${task.name}: ${currentTaskVersion} -> ${Major}.${nextMinor}.${nextPatch}`);
}

console.log(`Bumped extension version: ${currentVersion} -> ${nextVersion} (${releaseType})`);
