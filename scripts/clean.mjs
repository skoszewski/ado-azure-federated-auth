#!/usr/bin/env node
import { join } from 'node:path';
import { BUILD_DIR, SHARED_DIR, TASK_VERSIONS } from './paths.mjs';
import { cleanTask, remove } from './util.mjs';

remove(BUILD_DIR);
remove(join(SHARED_DIR, 'node_modules'));

for (const task of TASK_VERSIONS) {
  cleanTask(task);
}
