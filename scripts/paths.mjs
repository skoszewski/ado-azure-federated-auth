import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = dirname(scriptDir);
export const BUILD_DIR = join(ROOT_DIR, 'build');
export const TASK_DIR = join(ROOT_DIR, 'task');

/**
 * Sources imported by more than one task. They are compiled into each task's own dist, so the
 * folder needs its own package.json for the task library to resolve while type-checking.
 */
export const SHARED_DIR = join(TASK_DIR, 'shared');

/**
 * Task version folders, one per major version of a task. Each folder is self-contained: its own
 * task.json, package.json, src and dist.
 */
export const TASK_VERSIONS = [
  {
    name: 'AzureFederatedAuthV1',
    component: 'task-v1',
    dir: join(TASK_DIR, 'AzureFederatedAuth', 'AzureFederatedAuthV1'),
    tsconfig: join(ROOT_DIR, 'tsconfig.v1.json')
  },
  {
    name: 'AzureFederatedAuthV2',
    component: 'task-v2',
    dir: join(TASK_DIR, 'AzureFederatedAuth', 'AzureFederatedAuthV2'),
    tsconfig: join(ROOT_DIR, 'tsconfig.v2.json')
  },
  {
    name: 'AzureScopedAccessTokenV1',
    component: 'scoped-v1',
    dir: join(TASK_DIR, 'AzureScopedAccessToken', 'AzureScopedAccessTokenV1'),
    tsconfig: join(ROOT_DIR, 'tsconfig.scoped-v1.json')
  },
  {
    name: 'GoogleFederatedAuthV1',
    component: 'google-v1',
    dir: join(TASK_DIR, 'GoogleFederatedAuth', 'GoogleFederatedAuthV1'),
    tsconfig: join(ROOT_DIR, 'tsconfig.google-v1.json')
  }
];
