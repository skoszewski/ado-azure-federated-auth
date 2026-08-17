#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_DIR, ROOT_DIR, TASK_VERSIONS } from './paths.mjs';
import { run } from './run.mjs';
import { cleanTask, fail, readJson } from './util.mjs';

// Azure DevOps renders the task with icon.png sitting next to task.json, at 32x32.
const TASK_ICON_SIZE = 32;

// The Node pin lives in package.json engines; the first number in the range is the
// required major. semver is not used here because this runs before `npm ci`.
const { engines } = readJson(join(ROOT_DIR, 'package.json'));
const requiredMajor = Number.parseInt(engines.node.match(/\d+/)[0], 10);
const currentMajor = Number.parseInt(process.versions.node.split('.')[0], 10);

if (currentMajor !== requiredMajor) {
  fail(`Node.js ${engines.node} is required. Current version: v${process.versions.node}`);
}

mkdirSync(BUILD_DIR, { recursive: true });

if (existsSync(join(ROOT_DIR, 'package-lock.json'))) {
  run('npm', ['ci']);
} else {
  run('npm', ['install', '--no-audit', '--fund=false']);
}

for (const task of TASK_VERSIONS) {
  cleanTask(task);
  run('npm', ['install', '--prefix', task.dir, '--no-audit', '--fund=false']);
}

// sharp is imported dynamically because `npm ci` above populates node_modules.
const { default: sharp } = await import('sharp');
const iconSource = join(ROOT_DIR, 'images', 'icon.png');

for (const task of TASK_VERSIONS) {
  const iconTarget = join(task.dir, 'icon.png');
  await sharp(iconSource).resize(TASK_ICON_SIZE, TASK_ICON_SIZE).toFile(iconTarget);
  console.log(`Wrote ${iconTarget}`);
}

for (const task of TASK_VERSIONS) {
  run('npx', ['tsc', '-p', task.tsconfig]);
}

run('npx', [
  'tfx-cli',
  'extension',
  'create',
  '--manifest-globs',
  'vss-extension.json',
  '--output-path',
  BUILD_DIR
]);
