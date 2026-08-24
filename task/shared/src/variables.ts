import * as tl from 'azure-pipelines-task-lib/task.js';

// Azure DevOps ignores variables whose name starts with one of these prefixes.
const RESERVED_VARIABLE_PREFIXES = ['endpoint', 'input', 'secret', 'path', 'securefile'];

/**
 * Reads an input holding the name of a pipeline variable and checks it against the Azure DevOps
 * variable naming rules. An empty input yields defaultName; without a default the input is required.
 */
export function readVariableNameInput(inputName: string, defaultName?: string): string {
  const name = (tl.getInput(inputName, defaultName === undefined) ?? '').trim();

  if (name.length === 0) {
    if (defaultName === undefined) {
      throw new Error(`${inputName} must name a pipeline variable.`);
    }

    return defaultName;
  }

  if (!/^[A-Za-z0-9_.]+$/.test(name)) {
    throw new Error(
      `Invalid pipeline variable name in ${inputName}: ${name}. ` +
        'Names may contain letters, digits, "." and "_" only.'
    );
  }

  const lowerName = name.toLowerCase();
  const reserved = RESERVED_VARIABLE_PREFIXES.find((prefix) => lowerName.startsWith(prefix));

  if (reserved !== undefined) {
    throw new Error(
      `Pipeline variable ${name} starts with the Azure DevOps reserved prefix "${reserved}" ` +
        'and would not be readable by later steps.'
    );
  }

  return name;
}
