/**
 * Skip decision logic for linters.
 * Determines whether a linter should be executed based on file presence.
 *
 * Each rule focuses on files/extensions relevant to a particular linter so that
 * slow or irrelevant linters can be skipped when no matching source files exist.
 */

import {
  directoryExists,
  hasFilesInDir,
  hasFilesWithExtensions,
} from '../file-system/file-system.ts';
import type { LinterConfig } from '../types.ts';

/** Outcome of a skip rule evaluation. */
type SkipDecision = { readonly skip: boolean; readonly reason?: string };

/** A single skip rule for a specific linter id. */
type SkipRule = {
  readonly id: string;
  readonly shouldSkip: (linter: LinterConfig) => Promise<SkipDecision>;
};

/** Registry of skip decision rules keyed by linter id. */
const skipRuleRegistry: Record<string, SkipRule> = {
  markdownlint: {
    id: 'markdownlint',
    shouldSkip: async () => {
      const found = await hasFilesWithExtensions('.', ['.md']);
      return { skip: !found, reason: 'No Markdown files detected' };
    },
  },
  yamllint: {
    id: 'yamllint',
    shouldSkip: async () => {
      const foundGeneral = await hasFilesWithExtensions('.', ['.yaml', '.yml']);
      const workflowsDir = '.github/workflows';
      const foundWorkflows = (await directoryExists(workflowsDir))
        ? await hasFilesInDir(workflowsDir, ['.yml', '.yaml'])
        : false;
      return { skip: !foundGeneral && !foundWorkflows, reason: 'No YAML files detected' };
    },
  },
  shellcheck: {
    id: 'shellcheck',
    shouldSkip: async () => {
      const found = await hasFilesWithExtensions('.', ['.sh']);
      return { skip: !found, reason: 'No shell scripts detected' };
    },
  },
  hadolint: {
    id: 'hadolint',
    shouldSkip: async () => {
      const found = await hasFilesWithExtensions('.', ['dockerfile*']);
      return { skip: !found, reason: 'No Dockerfiles detected' };
    },
  },
  actionlint: {
    id: 'actionlint',
    shouldSkip: async () => {
      const workflowsDir = '.github/workflows';
      if (!(await directoryExists(workflowsDir))) {
        return { skip: true, reason: 'No GitHub Actions workflows directory present' };
      }
      const found = await hasFilesInDir(workflowsDir, ['.yml', '.yaml']);
      return { skip: !found, reason: 'No workflow files detected' };
    },
  },
};

/**
 * Determine whether the supplied `linter` should be skipped based on the
 * configured rules. Returns `{ skip: false }` when no rule applies.
 *
 * @param linter - Linter metadata used to select the appropriate skip rule.
 * @returns Decision indicating whether the linter should run.
 */
export async function shouldSkipLinter(linter: LinterConfig): Promise<SkipDecision> {
  const rule = skipRuleRegistry[linter.id];
  if (!rule) {
    return { skip: false };
  }
  return rule.shouldSkip(linter);
}
