import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as tl from 'azure-pipelines-task-lib/task.js';

const DEFAULT_TOKEN_ENVIRONMENT_VARIABLE = 'GIT_ACCESS_TOKEN';
const SCRIPT_BASE_NAME = 'git-ask-pass';

function readTokenEnvironmentVariable(): string {
  const name = (tl.getInput('tokenEnvironmentVariable', false) ?? '').trim();

  if (name.length === 0) {
    return DEFAULT_TOKEN_ENVIRONMENT_VARIABLE;
  }

  // The name is interpolated into the generated script, so it is restricted to the characters
  // an environment variable name may contain.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid environment variable name in tokenEnvironmentVariable: ${name}. ` +
        'Names start with a letter or "_" and continue with letters, digits and "_".'
    );
  }

  return name;
}

function defaultScriptPath(isWindows: boolean): string {
  const workspace = tl.getVariable('Pipeline.Workspace') ?? tl.getVariable('Agent.TempDirectory');

  if (workspace === undefined) {
    throw new Error(
      'Missing pipeline variable Pipeline.Workspace. Set scriptPath to choose the location.'
    );
  }

  return join(workspace, isWindows ? `${SCRIPT_BASE_NAME}.cmd` : SCRIPT_BASE_NAME);
}

function run(): void {
  try {
    const isWindows = process.platform === 'win32';
    const tokenEnvironmentVariable = readTokenEnvironmentVariable();
    const scriptPath = (tl.getInput('scriptPath', false) ?? '').trim() || defaultScriptPath(isWindows);

    // git invokes the helper with the prompt as its argument and reads the answer from standard
    // output, for both the username and the password prompt. The token stays in the environment
    // of the step that runs git.
    const script = isWindows
      ? ['@echo off', `echo %${tokenEnvironmentVariable}%`, ''].join('\r\n')
      : ['#!/usr/bin/env bash', `printf '%s\\n' "$${tokenEnvironmentVariable}"`, ''].join('\n');

    writeFileSync(scriptPath, script, 'utf8');

    if (!isWindows) {
      chmodSync(scriptPath, 0o700);
    }

    tl.setVariable('GIT_ASKPASS', scriptPath);

    console.log(`Git askpass script written to ${scriptPath}.`);
    console.log(`It reads the token from the ${tokenEnvironmentVariable} environment variable.`);

    tl.setResult(tl.TaskResult.Succeeded, 'GIT_ASKPASS configured.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, `Failed to create the git askpass script: ${message}`);
  }
}

run();
