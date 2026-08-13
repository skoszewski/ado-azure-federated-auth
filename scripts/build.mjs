#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_DIR, ROOT_DIR, TASK_VERSIONS } from './paths.mjs';
import { run } from './run.mjs';

const REQUIRED_NODE_MAJOR = 24;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor !== REQUIRED_NODE_MAJOR) {
  fail(`Node.js ${REQUIRED_NODE_MAJOR} LTS is required. Current version: v${process.versions.node}`);
}

mkdirSync(BUILD_DIR, { recursive: true });

if (existsSync(join(ROOT_DIR, 'package-lock.json'))) {
  run('npm', ['ci']);
} else {
  run('npm', ['install', '--no-audit', '--fund=false']);
}

for (const task of TASK_VERSIONS) {
  rmSync(join(task.dir, 'dist'), { recursive: true, force: true });
  rmSync(join(task.dir, 'node_modules'), { recursive: true, force: true });
  run('npm', ['install', '--prefix', task.dir, '--no-audit', '--fund=false']);
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
