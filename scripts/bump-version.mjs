#!/usr/bin/env node
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { ROOT_DIR, TASK_VERSIONS } from './paths.mjs';
import { fail as exitWith, readJson, writeJson } from './util.mjs';

const VALID_RELEASE_TYPES = new Set(['major', 'minor', 'patch']);
const EXTENSION_COMPONENT = 'extension';
const TASK_COMPONENTS = new Map(TASK_VERSIONS.map((task) => [task.component, task]));
const ALL_COMPONENTS = [EXTENSION_COMPONENT, ...TASK_COMPONENTS.keys()];

const USAGE = `Usage: bump-version.mjs [--component|-c COMPONENTS] [major|minor|patch]

  --component, -c  Comma separated, no spaces. One or more of: ${ALL_COMPONENTS.join(', ')}.
                   Defaults to every component.

The release type defaults to patch. A task's Major is never changed here; on a "major"
release type a task receives a minor bump instead, because the task major is its public
contract (AzureFederatedAuth@1, @2) and is only ever changed by hand.`;

function fail(message) {
  exitWith(message, USAGE);
}

function parseCommandLine() {
  let values;
  let positionals;

  try {
    ({ values, positionals } = parseArgs({
      options: {
        component: { type: 'string', short: 'c', multiple: true },
        help: { type: 'boolean', short: 'h' }
      },
      allowPositionals: true
    }));
  } catch (error) {
    fail(error.message);
  }

  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const components = (values.component ?? []).flatMap((value) =>
    value.split(',').filter((part) => part.length > 0)
  );

  for (const component of components) {
    if (!ALL_COMPONENTS.includes(component)) {
      fail(`Unknown component: ${component}. Allowed values: ${ALL_COMPONENTS.join(', ')}.`);
    }
  }

  const releaseType = positionals[0] ?? 'patch';
  if (!VALID_RELEASE_TYPES.has(releaseType)) {
    fail(`Invalid release type: ${releaseType}. Allowed values: major, minor, patch.`);
  }

  return {
    selected: components.length > 0 ? [...new Set(components)] : ALL_COMPONENTS,
    releaseType
  };
}

function bumpExtension(releaseType) {
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

  console.log(`${EXTENSION_COMPONENT}: ${currentVersion} -> ${nextVersion}`);
}

function bumpTask(task, releaseType) {
  const taskManifestPath = join(task.dir, 'task.json');
  const taskManifest = readJson(taskManifestPath);
  const { Major, Minor, Patch } = taskManifest.version;
  const currentVersion = `${Major}.${Minor}.${Patch}`;

  const bumped = semver.inc(currentVersion, releaseType === 'major' ? 'minor' : releaseType);
  if (bumped == null) {
    fail(`Could not increment ${task.name} version ${currentVersion}.`);
  }

  const [, nextMinor, nextPatch] = bumped.split('.').map((segment) => Number.parseInt(segment, 10));
  const nextVersion = `${Major}.${nextMinor}.${nextPatch}`;

  taskManifest.version = { Major, Minor: nextMinor, Patch: nextPatch };
  writeJson(taskManifestPath, taskManifest);

  const taskPackagePath = join(task.dir, 'package.json');
  const taskPackage = readJson(taskPackagePath);
  taskPackage.version = nextVersion;
  writeJson(taskPackagePath, taskPackage);

  console.log(`${task.component} (${task.name}): ${currentVersion} -> ${nextVersion}`);
}

const { selected, releaseType } = parseCommandLine();

for (const component of selected) {
  if (component === EXTENSION_COMPONENT) {
    bumpExtension(releaseType);
    continue;
  }

  bumpTask(TASK_COMPONENTS.get(component), releaseType);
}

console.log(`Release type: ${releaseType}. Components: ${selected.join(', ')}.`);
