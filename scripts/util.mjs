import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_DIR, TASK_VERSIONS } from './paths.mjs';

export function fail(message, details) {
  console.error(message);
  if (details !== undefined) {
    console.error(`\n${details}`);
  }
  process.exit(1);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function remove(target) {
  rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
}

export function cleanTask(task) {
  remove(join(task.dir, 'dist'));
  remove(join(task.dir, 'node_modules'));
  remove(join(task.dir, 'icon.png'));
}
