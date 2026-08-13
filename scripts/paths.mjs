import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = dirname(scriptDir);
export const BUILD_DIR = join(ROOT_DIR, 'build');
export const CONTRIBUTION_DIR = join(ROOT_DIR, 'task', 'AzureFederatedAuth');

/**
 * Task version folders, one per major version of the AzureFederatedAuth task.
 * Each folder is self-contained: its own task.json, package.json, src and dist.
 */
export const TASK_VERSIONS = [
  {
    name: 'AzureFederatedAuthV1',
    dir: join(CONTRIBUTION_DIR, 'AzureFederatedAuthV1'),
    tsconfig: join(ROOT_DIR, 'tsconfig.v1.json')
  },
  {
    name: 'AzureFederatedAuthV2',
    dir: join(CONTRIBUTION_DIR, 'AzureFederatedAuthV2'),
    tsconfig: join(ROOT_DIR, 'tsconfig.v2.json')
  }
];
