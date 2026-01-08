/**
 * Skip decision logic for linters.
 * Determines whether a linter should be executed based on file presence.
 */

import { directoryExists, hasFilesInDir, hasFilesWithExtensions } from './file-system.ts';
import type { LinterConfig } from './types.ts';

export async function shouldSkipLinter(
  linter: LinterConfig,
): Promise<{ skip: boolean; reason?: string }> {
  switch (linter.id) {
    case 'markdownlint': {
      const found = await hasFilesWithExtensions('.', ['.md']);
      return { skip: !found, reason: 'No Markdown files detected' };
    }
    case 'yamllint': {
      const foundGeneral = await hasFilesWithExtensions('.', ['.yaml', '.yml']);
      const workflowsDir = '.github/workflows';
      const foundWorkflows = (await directoryExists(workflowsDir))
        ? await hasFilesInDir(workflowsDir, ['.yml', '.yaml'])
        : false;
      return { skip: !foundGeneral && !foundWorkflows, reason: 'No YAML files detected' };
    }
    case 'shellcheck': {
      const found = await hasFilesWithExtensions('.', ['.sh']);
      return { skip: !found, reason: 'No shell scripts detected' };
    }
    case 'hadolint': {
      const found = await hasFilesWithExtensions('.', ['dockerfile*']);
      return { skip: !found, reason: 'No Dockerfiles detected' };
    }
    case 'actionlint': {
      const workflowsDir = '.github/workflows';
      if (!(await directoryExists(workflowsDir))) {
        return { skip: true, reason: 'No GitHub Actions workflows directory present' };
      }
      const found = await hasFilesInDir(workflowsDir, ['.yml', '.yaml']);
      return { skip: !found, reason: 'No workflow files detected' };
    }
    default:
      return { skip: false };
  }
}
