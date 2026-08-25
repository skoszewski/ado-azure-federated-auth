import { execFileSync } from 'node:child_process';
import { ROOT_DIR } from './paths.mjs';

/**
 * `npm run <script>` exports the caller's npm configuration to the child process as
 * npm_config_* environment variables. When a user or global .npmrc sets allow-scripts,
 * a nested `npm ci` / `npm install` sees it as an env-layer policy and refuses to run
 * with EALLOWSCRIPTS, because allow-scripts may only come from the project's own
 * package.json or .npmrc. See https://github.com/npm/cli/issues/9783.
 *
 * Stripping the inherited setting keeps the build identical whatever the ambient npm
 * configuration is; install-script policy for this project stays with the project.
 */
function childEnv() {
  const env = { ...process.env };

  for (const key of Object.keys(env)) {
    if (/^npm_config_allow[-_]scripts$/i.test(key)) {
      delete env[key];
    }
  }

  return env;
}

export function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd ?? ROOT_DIR,
    stdio: 'inherit',
    env: childEnv(),
    shell: process.platform === 'win32'
  });
}
