#!/usr/bin/env node
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_DIR, TASK_VERSIONS } from './paths.mjs';

const targets = [BUILD_DIR];

for (const task of TASK_VERSIONS) {
  targets.push(join(task.dir, 'dist'));
  targets.push(join(task.dir, 'node_modules'));
}

for (const target of targets) {
  rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
}
