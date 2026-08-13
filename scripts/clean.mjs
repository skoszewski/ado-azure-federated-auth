#!/usr/bin/env node
import { BUILD_DIR, TASK_VERSIONS } from './paths.mjs';
import { cleanTask, remove } from './util.mjs';

remove(BUILD_DIR);

for (const task of TASK_VERSIONS) {
  cleanTask(task);
}
