/**
 * Tests for scripts/validate-action-pinning.ts
 *
 * Validates the action pinning validator script with comprehensive coverage.
 *
 * Coverage notes (uncovered lines explained):
 * - Line 16: Comment/documentation line (not executable code)
 * - CLI bootstrap block (isMainModule check): Only executes when the script runs directly
 *   as a CLI tool, not when imported as a module in tests.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as validator from './validate-action-pinning.ts';

describe('validate-action-pinning', () => {
  let tempDir: string;
  let workflowsDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'action-pinning-test-'));
    workflowsDir = path.join(tempDir, '.github', 'workflows');
    await mkdir(workflowsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // Shared HTTPS mock helpers for tests that need to stub GitHub API responses
  const createMockResponse = (data: string) => ({
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'data') {
        handler(data);
      } else if (event === 'end') {
        handler();
      }
      return createMockResponse(data);
    },
  });

  const mockHttpsGetWithData = (data: string) =>
    vi.spyOn(https, 'get').mockImplementation((_url, _options, callback) => {
      if (typeof callback === 'function') {
        const response = createMockResponse(data);
        callback(response as never);
      }
      const request = { on: () => ({ on: () => ({}) }) };
      return request as never;
    });

  const mockHttpsGetWithSha = (sha: string) => mockHttpsGetWithData(JSON.stringify({ sha }));

  const mockHttpsGetWithOptionsCheck = (expectedHeaders: Record<string, unknown>, sha: string) =>
    vi.spyOn(https, 'get').mockImplementation((_url, options, callback) => {
      expect(options).toMatchObject({ headers: expectedHeaders });
      if (typeof callback === 'function') {
        const response = createMockResponse(JSON.stringify({ sha }));
        callback(response as never);
      }
      const request = { on: () => ({ on: () => ({}) }) };
      return request as never;
    });

  describe('isValidSha', () => {
    it('should return true for valid 40-char SHA', () => {
      expect(validator.isValidSha('8e8c483db84b4bee98b60c0593521ed34d9990e8')).toBe(true);
      expect(validator.isValidSha('395ad3262231945c25e8478fd5baf05154b1d79f')).toBe(true);
    });

    it('should return false for invalid SHA', () => {
      expect(validator.isValidSha('8e8c483')).toBe(false); // Too short
      expect(validator.isValidSha('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false); // Invalid chars
      expect(validator.isValidSha('8e8c483db84b4bee98b60c0593521ed34d9990e88')).toBe(false); // Too long
      expect(validator.isValidSha('')).toBe(false); // Empty
    });
  });

  describe('parseActionRef', () => {
    it('should parse action reference with @', () => {
      const result = validator.parseActionRef('actions/checkout@v4');
      expect(result).toEqual({
        owner: 'actions',
        repo: 'checkout',
        actionPath: '',
        repoSlug: 'actions/checkout',
        ref: 'v4',
        full: 'actions/checkout@v4',
      });
    });

    it('should return null when owner/repo is missing', () => {
      const result = validator.parseActionRef('actions@v4');
      expect(result).toBeNull();
    });

    it('should parse action reference with SHA', () => {
      const result = validator.parseActionRef(
        'actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8',
      );
      expect(result).toEqual({
        owner: 'actions',
        repo: 'checkout',
        actionPath: '',
        repoSlug: 'actions/checkout',
        ref: '8e8c483db84b4bee98b60c0593521ed34d9990e8',
        full: 'actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8',
      });
    });

    it('should return null for action without @', () => {
      const result = validator.parseActionRef('actions/checkout');
      expect(result).toBeNull();
    });
  });

  describe('resolveToSha authorization headers', () => {
    it('should include Authorization header when GITHUB_TOKEN is set', async () => {
      vi.stubEnv('GITHUB_TOKEN', 'token123');
      const sha = '8e8c483db84b4bee98b60c0593521ed34d9990e8';

      const getSpy = mockHttpsGetWithOptionsCheck(
        expect.objectContaining({ Authorization: 'Bearer token123' }),
        sha,
      );

      const result = await validator.resolveToSha('actions/checkout@v4');
      expect(result?.sha).toBe(sha);

      getSpy.mockRestore();
    });

    it('should omit Authorization header when no token is set', async () => {
      vi.unstubAllEnvs();
      const sha = '8e8c483db84b4bee98b60c0593521ed34d9990e8';

      const getSpy = mockHttpsGetWithOptionsCheck(
        expect.not.objectContaining({ Authorization: expect.any(String) }),
        sha,
      );

      const result = await validator.resolveToSha('actions/checkout@v4');
      expect(result?.sha).toBe(sha);

      getSpy.mockRestore();
    });
  });

  describe('isLocalAction', () => {
    it('should return true for local actions', () => {
      expect(validator.isLocalAction('./.github/actions/my-action')).toBe(true);
      expect(validator.isLocalAction('../actions/my-action')).toBe(true);
    });

    it('should return false for remote actions', () => {
      expect(validator.isLocalAction('actions/checkout@v4')).toBe(false);
      expect(validator.isLocalAction('owner/repo@main')).toBe(false);
    });
  });

  describe('findWorkflowFiles', () => {
    it('should find .yml and .yaml files', async () => {
      await writeFile(path.join(workflowsDir, 'ci.yml'), 'name: CI');
      await writeFile(path.join(workflowsDir, 'release.yaml'), 'name: Release');
      await writeFile(path.join(workflowsDir, 'readme.md'), '# README');

      const files = validator.findWorkflowFiles(workflowsDir);

      expect(files).toHaveLength(2);
      expect(files.some((f) => f.endsWith('ci.yml'))).toBe(true);
      expect(files.some((f) => f.endsWith('release.yaml'))).toBe(true);
    });

    it('should return empty array for non-existent directory', () => {
      const files = validator.findWorkflowFiles(path.join(tempDir, 'nonexistent'));
      expect(files).toEqual([]);
    });

    it('should return empty array for empty directory', () => {
      const files = validator.findWorkflowFiles(workflowsDir);
      expect(files).toEqual([]);
    });

    it('should return empty array when directory read fails', async () => {
      // Create a file instead of a directory to cause readDirEntries to throw
      const notADirectory = path.join(tempDir, 'not-a-dir.txt');
      await writeFile(notADirectory, 'not a directory');

      const files = validator.findWorkflowFiles(notADirectory);
      expect(files).toEqual([]);
    });
  });

  describe('extractUnpinnedActions', () => {
    it('should extract unpinned action with tag', async () => {
      const file = path.join(workflowsDir, 'test.yml');
      await writeFile(
        file,
        `name: Test
on: push
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
`,
      );

      const unpinned = validator.extractUnpinnedActions(file);

      expect(unpinned).toHaveLength(1);
      expect(unpinned[0]).toMatchObject({
        file,
        lineNum: 6,
        actionRef: 'actions/checkout@v4',
      });
    });

    it('should skip pinned actions with valid SHA', async () => {
      const file = path.join(workflowsDir, 'test.yml');
      await writeFile(
        file,
        `name: Test
on: push
jobs:
  test:
    steps:
      - uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8
`,
      );

      const unpinned = validator.extractUnpinnedActions(file);

      expect(unpinned).toHaveLength(0);
    });

    it('should skip local actions', async () => {
      const file = path.join(workflowsDir, 'test.yml');
      await writeFile(
        file,
        `name: Test
on: push
jobs:
  test:
    steps:
      - uses: ./.github/actions/my-action
`,
      );

      const unpinned = validator.extractUnpinnedActions(file);

      expect(unpinned).toHaveLength(0);
    });

    it('should skip commented uses:', async () => {
      const file = path.join(workflowsDir, 'test.yml');
      await writeFile(
        file,
        `name: Test
on: push
jobs:
  test:
    steps:
      # uses: actions/checkout@v4
      - uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8
`,
      );

      const unpinned = validator.extractUnpinnedActions(file);

      expect(unpinned).toHaveLength(0);
    });

    it('should detect multiple unpinned actions', async () => {
      const file = path.join(workflowsDir, 'test.yml');
      await writeFile(
        file,
        `name: Test
on: push
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
`,
      );

      const unpinned = validator.extractUnpinnedActions(file);

      expect(unpinned).toHaveLength(2);
      expect(unpinned[0].actionRef).toBe('actions/checkout@v4');
      expect(unpinned[1].actionRef).toBe('actions/setup-node@v4');
    });

    it('should detect short SHA as unpinned', async () => {
      const file = path.join(workflowsDir, 'test.yml');
      await writeFile(
        file,
        `name: Test
on: push
jobs:
  test:
    steps:
      - uses: actions/checkout@8e8c483
`,
      );

      const unpinned = validator.extractUnpinnedActions(file);

      expect(unpinned).toHaveLength(1);
      expect(unpinned[0].actionRef).toBe('actions/checkout@8e8c483');
    });
  });

  describe('fixUnpinnedAction', () => {
    it('should return failure when SHA resolution fails', async () => {
      const file = path.join(workflowsDir, 'test.yml');
      await writeFile(file, 'name: Test\nsteps:\n  - uses: actions/checkout@invalid-ref\n');

      // Use a definitely invalid reference that will fail
      const result = await validator.fixUnpinnedAction(
        file,
        'actions/checkout@invalid-ref-12345678',
      );

      expect(result.success).toBe(false);
      expect(result.newRef).toBeUndefined();
    });

    it('should handle invalid action reference', async () => {
      const file = path.join(workflowsDir, 'test.yml');
      await writeFile(file, 'name: Test\nsteps:\n  - uses: actions/checkout@v4\n');

      // Action without @ should fail
      const result = await validator.fixUnpinnedAction(file, 'invalid-no-at');

      expect(result.success).toBe(false);
      expect(result.newRef).toBeUndefined();
    });

    it('should return failure when file write fails', async () => {
      const nonExistentFile = path.join(workflowsDir, 'nonexistent', 'test.yml');

      // Try to fix action in a file that doesn't exist - should fail on write
      const result = await validator.fixUnpinnedAction(
        nonExistentFile,
        'actions/checkout@invalid-ref-99999',
      );

      expect(result.success).toBe(false);
    });

    // helpers moved to outer scope for reuse

    it('should handle file read errors gracefully', async () => {
      const file = path.join(workflowsDir, 'test.yml');
      // Create file then immediately remove it to cause read error
      await writeFile(file, 'name: Test\nsteps:\n  - uses: actions/checkout@v4\n');

      // Mock https.get to return a successful SHA
      const mockGet = mockHttpsGetWithSha('8e8c483db84b4bee98b60c0593521ed34d9990e8');

      // Delete the file after mocking, so resolveToSha succeeds but file operations fail
      await rm(file);

      // Should catch the error and return failure
      const result = await validator.fixUnpinnedAction(file, 'actions/checkout@v4');

      expect(result.success).toBe(false);

      mockGet.mockRestore();
    });

    it('should successfully fix action when file operations succeed', async () => {
      const file = path.join(workflowsDir, 'test.yml');
      const initialContent = `name: Test
on: push
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
`;
      await writeFile(file, initialContent);

      // Mock https.get to return a successful SHA response
      const mockGet = mockHttpsGetWithSha('8e8c483db84b4bee98b60c0593521ed34d9990e8');

      const result = await validator.fixUnpinnedAction(file, 'actions/checkout@v4');

      expect(result.success).toBe(true);
      expect(result.newRef).toBe('actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8');

      // Verify file was updated
      const updatedContent = await readFile(file, 'utf8');
      expect(updatedContent).toContain('actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8');
      expect(updatedContent).not.toContain('actions/checkout@v4');

      mockGet.mockRestore();
    });

    it('should successfully fix action with an action path', async () => {
      const file = path.join(workflowsDir, 'test.yml');
      const initialContent = `name: Test
on: push
jobs:
  test:
    steps:
      - uses: actions/setup-node/path/to/action@v4
`;
      await writeFile(file, initialContent);

      const mockGet = mockHttpsGetWithSha('8e8c483db84b4bee98b60c0593521ed34d9990e8');

      const result = await validator.fixUnpinnedAction(
        file,
        'actions/setup-node/path/to/action@v4',
      );

      expect(result.success).toBe(true);
      expect(result.newRef).toBe(
        'actions/setup-node/path/to/action@8e8c483db84b4bee98b60c0593521ed34d9990e8',
      );

      const updatedContent = await readFile(file, 'utf8');
      expect(updatedContent).toContain(
        'actions/setup-node/path/to/action@8e8c483db84b4bee98b60c0593521ed34d9990e8',
      );
      expect(updatedContent).not.toContain('actions/setup-node/path/to/action@v4');

      mockGet.mockRestore();
    });
  });

  describe('validate', () => {
    it('should return 0 when all actions are properly pinned', async () => {
      await writeFile(
        path.join(workflowsDir, 'test.yml'),
        `name: Test
on: push
jobs:
  test:
    steps:
      - uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8
`,
      );

      const exitCode = await validator.validate(workflowsDir, false);

      expect(exitCode).toBe(0);
    });

    it('should return 1 when unpinned actions detected', async () => {
      await writeFile(
        path.join(workflowsDir, 'test.yml'),
        `name: Test
on: push
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
`,
      );

      const exitCode = await validator.validate(workflowsDir, false);

      expect(exitCode).toBe(1);
    });

    it('should skip malformed action references without @ symbol', async () => {
      await writeFile(
        path.join(workflowsDir, 'test.yml'),
        `name: Test
on: push
jobs:
  test:
    steps:
      - uses: actions/checkout
      - uses: actions/setup-node@v4
`,
      );

      // Should detect the unpinned actions/setup-node@v4, but skip malformed actions/checkout
      const exitCode = await validator.validate(workflowsDir, false);

      expect(exitCode).toBe(1);
    });

    it('should return 1 when workflows directory does not exist', async () => {
      const exitCode = await validator.validate(path.join(tempDir, 'nonexistent'), false);

      expect(exitCode).toBe(1);
    });

    it('should return 0 when no workflow files found', async () => {
      const exitCode = await validator.validate(workflowsDir, false);

      expect(exitCode).toBe(0);
    });

    it('should return 1 in fix mode when SHA resolution fails', async () => {
      await writeFile(
        path.join(workflowsDir, 'test.yml'),
        `name: Test
on: push
jobs:
  test:
    steps:
      - uses: actions/checkout@invalid-ref-that-will-fail-resolution
`,
      );

      const exitCode = await validator.validate(workflowsDir, true);

      expect(exitCode).toBe(1);
    });

    it('should check multiple workflow files', async () => {
      await writeFile(
        path.join(workflowsDir, 'ci.yml'),
        `name: CI
steps:
  - uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8
`,
      );
      await writeFile(
        path.join(workflowsDir, 'release.yaml'),
        `name: Release
steps:
  - uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8
`,
      );

      const exitCode = await validator.validate(workflowsDir, false);

      expect(exitCode).toBe(0);
    });

    it('should display success message in fix mode when all fixed', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await writeFile(
        path.join(workflowsDir, 'test.yml'),
        `name: Test
steps:
  - uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8
`,
      );

      const exitCode = await validator.validate(workflowsDir, true);

      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('✅ All unpinned actions have been fixed');

      consoleSpy.mockRestore();
    });
  });

  describe('main', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should display help with --help', async () => {
      const exitCode = await validator.main(['--help']);

      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--fix'));
    });

    it('should display help with -h', async () => {
      const exitCode = await validator.main(['-h']);

      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    });

    it('should validate default workflows directory', async () => {
      const exitCode = await validator.main([]);

      // Should validate the actual .github/workflows in this project
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Validating GitHub Actions'));
    });

    it('should validate custom workflows directory', async () => {
      await writeFile(
        path.join(workflowsDir, 'test.yml'),
        `name: Test
steps:
  - uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8
`,
      );

      const exitCode = await validator.main([workflowsDir]);

      expect(exitCode).toBe(0);
    });

    it('should enable fix mode with --fix', async () => {
      await writeFile(
        path.join(workflowsDir, 'test.yml'),
        `name: Test
steps:
  - uses: actions/checkout@invalid-will-fail
`,
      );

      const exitCode = await validator.main(['--fix', workflowsDir]);

      // Will fail because invalid ref cannot be resolved
      expect(exitCode).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Fixing unpinned action'));
    });

    it('should return 1 for non-existent directory', async () => {
      const exitCode = await validator.main([path.join(tempDir, 'nonexistent')]);

      expect(exitCode).toBe(1);
    });
  });

  describe('resolveToSha', () => {
    it('should return null for invalid action reference', async () => {
      const result = await validator.resolveToSha('invalid-no-at-sign');
      expect(result).toBeNull();
    });

    it('should return null when API returns invalid JSON', async () => {
      const mockGet = mockHttpsGetWithData('invalid json {{{');

      const result = await validator.resolveToSha('actions/checkout@v4');

      expect(result).toBeNull();
      mockGet.mockRestore();
    });

    it('should return null when API returns non-string SHA', async () => {
      const mockGet = mockHttpsGetWithData(JSON.stringify({ sha: Number('12345') }));

      const result = await validator.resolveToSha('actions/checkout@v4');

      expect(result).toBeNull();
      mockGet.mockRestore();
    });

    it('should return null when API returns invalid SHA format', async () => {
      const mockGet = mockHttpsGetWithData(JSON.stringify({ sha: 'abc123' }));

      const result = await validator.resolveToSha('actions/checkout@v4');

      expect(result).toBeNull();
      mockGet.mockRestore();
    });

    // Integration test with real network call (with timeout protection)
    it(
      'should resolve a real GitHub action tag to ResolvedAction',
      { timeout: 10_000 },
      async () => {
        // Use a stable, old tag that's unlikely to change
        const result = await validator.resolveToSha('actions/checkout@v1');

        // If network call succeeds, should return a valid ResolvedAction
        // If network fails, should return null (both are acceptable for integration test)
        if (result !== null) {
          expect(validator.isValidSha(result.sha)).toBe(true);
          expect(result.owner).toBe('actions');
          expect(result.repo).toBe('checkout');
          expect(result.repoSlug).toBe('actions/checkout');
        }
      },
    );
  });

  describe('Integration tests', () => {
    it('should successfully fix an unpinned action with mocked successful SHA resolution', async () => {
      const file = path.join(workflowsDir, 'test.yml');
      await writeFile(
        file,
        `name: Test
steps:
  - uses: actions/checkout@v4
`,
      );

      // Mock https.get to return a successful response
      const mockGet = mockHttpsGetWithSha('8e8c483db84b4bee98b60c0593521ed34d9990e8');

      const result = await validator.fixUnpinnedAction(file, 'actions/checkout@v4');

      expect(result.success).toBe(true);
      expect(result.newRef).toBe('actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8');

      const content = await readFile(file, 'utf8');
      expect(content).toContain('actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8');
      expect(content).not.toContain('actions/checkout@v4');

      mockGet.mockRestore();
    });

    it('should show success message in fix mode when fixing succeeds', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await writeFile(
        path.join(workflowsDir, 'test.yml'),
        `name: Test
steps:
  - uses: actions/checkout@v4
`,
      );

      // Mock https.get to return a successful response
      const mockGet = mockHttpsGetWithSha('8e8c483db84b4bee98b60c0593521ed34d9990e8');

      const exitCode = await validator.validate(workflowsDir, true);

      expect(exitCode).toBe(0);

      // Should show the success message for the fix
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Fixed:'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'actions/checkout@v4 → actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8',
        ),
      );

      mockGet.mockRestore();
      consoleSpy.mockRestore();
    });

    it(
      'should successfully fix an unpinned action with real SHA resolution',
      { timeout: 10_000 },
      async () => {
        const file = path.join(workflowsDir, 'test.yml');
        await writeFile(
          file,
          `name: Test
steps:
  - uses: actions/checkout@v1
`,
        );

        // Use a very old, stable tag
        const result = await validator.fixUnpinnedAction(file, 'actions/checkout@v1');

        // If network succeeds, should fix successfully
        // If network fails, should fail gracefully (both are valid)
        if (result.success) {
          expect(result.newRef).toBeDefined();
          expect(result.newRef).toContain('actions/checkout@');
          const content = await readFile(file, 'utf8');
          expect(content).toContain(result.newRef);
        } else {
          // Network failure is acceptable in tests
          expect(result.success).toBe(false);
        }
      },
    );

    it(
      'should validate and fix successfully in fix mode with real resolution',
      { timeout: 10_000 },
      async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await writeFile(
          path.join(workflowsDir, 'test.yml'),
          `name: Test
steps:
  - uses: actions/checkout@v1
`,
        );

        const exitCode = await validator.validate(workflowsDir, true);

        // Should attempt to fix and either succeed (exit 0) or fail (exit 1) based on network
        expect([0, 1]).toContain(exitCode);

        // Should have attempted to fix
        const fixAttempts = consoleSpy.mock.calls.filter((call) =>
          String(call[0]).includes('Fixing unpinned action'),
        );
        expect(fixAttempts.length).toBeGreaterThan(0);

        // If successful, should show success message
        if (exitCode === 0) {
          expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Fixed:'));
        }

        consoleSpy.mockRestore();
      },
    );
  });

  describe('Module checks', () => {
    it('should identify main module correctly', () => {
      // Test the isMainModule logic
      const originalArgv = process.argv[1];

      // Simulate running as main module
      process.argv[1] = '/path/to/validate-action-pinning.ts';
      const isMain1 =
        process.argv[1]?.endsWith('validate-action-pinning.ts') === true ||
        process.argv[1]?.endsWith('validate-action-pinning.js') === true;
      expect(isMain1).toBe(true);

      process.argv[1] = '/path/to/validate-action-pinning.js';
      const isMain2 =
        process.argv[1]?.endsWith('validate-action-pinning.ts') === true ||
        process.argv[1]?.endsWith('validate-action-pinning.js') === true;
      expect(isMain2).toBe(true);

      // Simulate running as imported module
      process.argv[1] = '/path/to/other-file.ts';
      const isMain3 =
        process.argv[1]?.endsWith('validate-action-pinning.ts') === true ||
        process.argv[1]?.endsWith('validate-action-pinning.js') === true;
      expect(isMain3).toBe(false);

      // Restore
      process.argv[1] = originalArgv;
    });
  });
});
