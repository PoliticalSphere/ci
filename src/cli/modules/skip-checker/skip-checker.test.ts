/**
 * Tests for skip checker module
 *
 * Covers each skip rule to ensure they respect file presence heuristics.
 */

import { describe, expect, it, vi } from 'vitest';
import { MS_PER_SECOND } from '../../constants/time.ts';

import { shouldSkipLinter } from './skip-checker.ts';

// Mock the file system utilities
vi.mock('../file-system/file-system.ts', () => ({
  directoryExists: vi.fn(),
  hasFilesInDir: vi.fn(),
  hasFilesWithExtensions: vi.fn(),
  matchesPattern: vi.fn(),
}));

type FsMocks = {
  readonly directoryExists: ReturnType<typeof vi.fn>;
  readonly hasFilesInDir: ReturnType<typeof vi.fn>;
  readonly hasFilesWithExtensions: ReturnType<typeof vi.fn>;
};

const LINTER_META: Record<string, { readonly name: string; readonly description: string }> = {
  markdownlint: { name: 'Markdownlint', description: 'Markdownlint' },
  yamllint: { name: 'Yamllint', description: 'Yamllint' },
  shellcheck: { name: 'ShellCheck', description: 'ShellCheck' },
  hadolint: { name: 'Hadolint', description: 'Hadolint' },
  actionlint: { name: 'Actionlint', description: 'Actionlint' },
};

/** Construct a minimal LinterConfig-like object for tests. */
const buildLinter = (id: string) => {
  const meta = LINTER_META[id] ?? { name: 'Unknown', description: 'Unknown linter' };
  return {
    id,
    name: meta.name,
    binary: id,
    args: [],
    timeoutMs: MS_PER_SECOND,
    mode: 'direct' as const,
    risk: 'low' as const,
    enforcement: 'advisory' as const,
    description: meta.description,
  };
};

/** Import and return mocked filesystem utility functions. */
const getFsMocks = async (): Promise<FsMocks> => {
  const fs = await vi.importMock('../file-system/file-system.ts');
  return {
    directoryExists: vi.mocked(fs.directoryExists),
    hasFilesInDir: vi.mocked(fs.hasFilesInDir),
    hasFilesWithExtensions: vi.mocked(fs.hasFilesWithExtensions),
  };
};

/** Helper to assert the skip decision for a given linter id. */
const expectSkip = async (id: string, skip: boolean, reason?: string) => {
  const result = await shouldSkipLinter(buildLinter(id));
  expect(result.skip).toBe(skip);
  if (reason) {
    expect(result.reason).toContain(reason);
  }
};

describe('Skip Checker Module', () => {
  describe('shouldSkipLinter', () => {
    it('skips unknown linters by default', async () => {
      const result = await shouldSkipLinter(buildLinter('unknown-linter'));
      expect(result.skip).toBe(false);
    });

    const simpleCases = [
      ['markdownlint', true, false, undefined],
      ['markdownlint', false, true, 'No Markdown files'],
      ['shellcheck', true, false, undefined],
      ['shellcheck', false, true, 'No shell scripts'],
      ['hadolint', true, false, undefined],
      ['hadolint', false, true, 'No Dockerfiles'],
    ] as const;

    it.each(simpleCases)('handles %s file presence checks', async (id, hasFiles, skip, reason) => {
      const { hasFilesWithExtensions } = await getFsMocks();
      hasFilesWithExtensions.mockResolvedValue(hasFiles);
      await expectSkip(id, skip, reason);
    });

    const yamlCases = [
      ['yamllint', true, false, false, false],
      ['yamllint', false, true, false, true],
      ['yamllint', false, true, true, false],
      ['yamllint', false, false, false, true],
    ] as const;

    it.each(
      yamlCases,
    )('handles yamllint with general=%s workflowsDir=%s workflowsFiles=%s', async (id, foundGeneral, workflowsDirExists, foundWorkflows, skip) => {
      const { directoryExists, hasFilesInDir, hasFilesWithExtensions } = await getFsMocks();
      hasFilesWithExtensions.mockResolvedValue(foundGeneral);
      directoryExists.mockResolvedValue(workflowsDirExists);
      hasFilesInDir.mockResolvedValue(foundWorkflows);
      await expectSkip(id, skip, skip ? 'No YAML files' : undefined);
    });

    const actionCases = [
      ['actionlint', false, false, true, 'No GitHub Actions workflows'],
      ['actionlint', true, true, false, undefined],
      ['actionlint', true, false, true, 'No workflow files'],
    ] as const;

    it.each(
      actionCases,
    )('handles actionlint with workflowsDir=%s hasFiles=%s', async (id, workflowsDirExists, foundWorkflows, skip, reason) => {
      const { directoryExists, hasFilesInDir } = await getFsMocks();
      directoryExists.mockResolvedValue(workflowsDirExists);
      hasFilesInDir.mockResolvedValue(foundWorkflows);
      await expectSkip(id, skip, reason);
    });
  });
});
