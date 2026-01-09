import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('node:fs', () => ({ readFileSync: vi.fn(), writeFileSync: vi.fn() }));
vi.mock('node:https', () => ({
  default: {
    get: vi.fn(),
    request: vi.fn(),
  },
}));
vi.mock('../src/policy/decision.ts', () => ({
  evaluatePolicy: vi.fn(),
  generateMarkdownSummary: vi.fn(),
  serializeToJSON: vi.fn(),
}));

type EvaluatePolicyOutput = import('../src/policy/decision.ts').EvaluatePolicyOutput;

// ─────────────────────────────────────────────────────────────────────────────
// Shared test fixtures and helpers to reduce duplication
// ─────────────────────────────────────────────────────────────────────────────

const NO_RULES_DECISION_TRAIL: EvaluatePolicyOutput['result']['decisionTrail'] = [
  {
    rule: 'NO_RULES_TRIGGERED',
    before: 'allow',
    after: 'allow',
    detail: 'No policy violations detected',
  },
];

const DEFAULT_ATTESTATION = {
  ai: {
    attestation: {
      declared: false,
      reviewed: false,
      noSecrets: false,
      alignsWithStandards: false,
      locallyTested: false,
    },
    validation: { valid: true, missing: [], warnings: [] },
  },
  highRisk: {
    attestation: {
      declared: false,
      understood: false,
      securityReviewed: false,
      noPrivilegeEscalation: false,
      documented: false,
      rollbackPlan: false,
      monitoringCommitment: false,
    },
    validation: { valid: true, missing: [], warnings: [] },
  },
};

function makePolicyOutput(
  decision: EvaluatePolicyOutput['result']['decision'],
  changedFilesCount: number,
  classification: Partial<EvaluatePolicyOutput['classification']> = {},
): EvaluatePolicyOutput {
  return {
    result: {
      decision,
      riskTier: 'low',
      violations: [],
      decisionTrail: NO_RULES_DECISION_TRAIL,
      metadata: {
        timestamp: new Date().toISOString(),
        changedFilesCount,
        highRiskPathsCount: 0,
        aiAssisted: false,
        rationale: [],
      },
    },
    classification: { tier: 'low', paths: [], reasons: [], ...classification },
    ...DEFAULT_ATTESTATION,
  };
}

const getMocks = async () => {
  const childProcess = await import('node:child_process');
  const fs = await import('node:fs');
  const policy = await import('../src/policy/decision.ts');
  const https = await import('node:https');
  return { childProcess, fs, policy, https };
};

/** Create a mock GitHub event JSON for pull request */
function createPREvent(
  opts: {
    body?: string;
    base?: string;
    head?: string;
    number?: number;
    owner?: string;
    repo?: string;
  } = {},
) {
  return JSON.stringify({
    pull_request: {
      body: opts.body ?? 'test body',
      base: { sha: opts.base ?? 'base-sha' },
      head: { sha: opts.head ?? 'head-sha' },
      number: opts.number ?? 123,
    },
    repository: { owner: { login: opts.owner ?? 'test-owner' }, name: opts.repo ?? 'test-repo' },
  });
}

/** Create a minimal mock event emitter for https response */
function createMockResponse(statusCode: number, data: string) {
  const handlers: Record<string, ((chunk: unknown) => void)[]> = {};
  const response = {
    statusCode,
    on(event: string, handler: (chunk: unknown) => void) {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
      if (event === 'end') {
        // Schedule data and end events
        setImmediate(() => {
          for (const h of handlers.data ?? []) {
            h(Buffer.from(data));
          }
          for (const h of handlers.end ?? []) {
            h(undefined);
          }
        });
      }
      return this;
    },
  };
  return response;
}

/** Mock https.get to return success with given JSON data */
function mockHttpsGetSuccess(
  httpsMock: typeof import('node:https'),
  responses: Record<string, unknown>,
) {
  vi.mocked(httpsMock.default.get).mockImplementation(
    (options: { path?: string }, callback: (res: unknown) => void) => {
      const path = typeof options === 'string' ? options : (options?.path ?? '');
      const responseData = responses[path] ?? { statuses: [], check_runs: [] };
      const res = createMockResponse(200, JSON.stringify(responseData));
      setImmediate(() => callback(res));
      return { on: vi.fn().mockReturnThis() } as unknown as ReturnType<
        typeof httpsMock.default.get
      >;
    },
  );
}

/** Mock https.get to return non-200 status (error case) */
function mockHttpsGetNon200(httpsMock: typeof import('node:https'), statusCode: number) {
  vi.mocked(httpsMock.default.get).mockImplementation(
    (_options: unknown, callback: (res: unknown) => void) => {
      const res = createMockResponse(statusCode, 'Not Found');
      setImmediate(() => callback(res));
      return { on: vi.fn().mockReturnThis() } as unknown as ReturnType<
        typeof httpsMock.default.get
      >;
    },
  );
}

/** Mock https.get to trigger network error */
function mockHttpsGetError(httpsMock: typeof import('node:https'), immediate = false) {
  vi.mocked(httpsMock.default.get).mockImplementation(() => {
    return {
      on: (event: string, handler: (e?: Error) => void) => {
        if (event === 'error') {
          if (immediate) {
            handler(new Error('Network error'));
          } else {
            setImmediate(() => handler(new Error('Network error')));
          }
        }
        return { on: vi.fn() };
      },
    } as unknown as ReturnType<typeof httpsMock.default.get>;
  });
}

/** Mock https.request for comment posting */
function mockHttpsRequestResult(httpsMock: typeof import('node:https'), statusCode: number) {
  vi.mocked(httpsMock.default.request).mockImplementation(
    (_options: unknown, callback: (res: unknown) => void) => {
      const res = createMockResponse(statusCode, statusCode === 201 ? '{}' : 'Error response');
      setImmediate(() => callback(res));
      return {
        on: vi.fn().mockReturnThis(),
        write: vi.fn(),
        end: vi.fn(),
      } as unknown as ReturnType<typeof httpsMock.default.request>;
    },
  );
}

/** Setup standard policy mocks for allow/warn/deny */

type Decision = 'allow' | 'warn' | 'deny';

function setupPolicyMocks(
  policy: Awaited<ReturnType<typeof getMocks>>['policy'],
  decision: Decision,
  changedCount = 1,
) {
  const out = makePolicyOutput(decision, changedCount);
  vi.mocked(policy.evaluatePolicy).mockReturnValueOnce(out);
  vi.mocked(policy.serializeToJSON).mockReturnValueOnce(`{"decision":"${decision}"}`);
  vi.mocked(policy.generateMarkdownSummary).mockReturnValueOnce(`# ${decision}`);
  return out;
}

interface TestSetupOpts {
  prEvent?: string;
  changedFiles?: string;
  decision?: Decision;
  withToken?: boolean;
  gitFails?: boolean;
}

/** Setup common test scenario with PR event, git changes, and policy decision */
async function setupTestScenario(opts: TestSetupOpts = {}) {
  const {
    prEvent = createPREvent(),
    changedFiles = 'src/file.ts\n',
    decision = 'allow',
    withToken = false,
    gitFails = false,
  } = opts;

  const consoleLogs = vi.spyOn(console, 'log').mockImplementation(() => {});
  const consoleErrors = vi.spyOn(console, 'error').mockImplementation(() => {});

  // Use a secure temp path that's not world-writable (mocked filesystem)
  vi.stubEnv('GITHUB_EVENT_PATH', '/secure/github-event.json');
  if (withToken) {
    vi.stubEnv('GITHUB_TOKEN', 'fake-token');
  }

  const mocks = await getMocks();
  vi.mocked(mocks.fs.readFileSync).mockReturnValueOnce(prEvent);

  if (gitFails) {
    vi.mocked(mocks.childProcess.execFileSync).mockImplementation(() => {
      throw new Error('git failed');
    });
  } else {
    vi.mocked(mocks.childProcess.execFileSync).mockReturnValueOnce(changedFiles);
  }

  setupPolicyMocks(mocks.policy, decision);

  return {
    ...mocks,
    consoleLogs,
    consoleErrors,
    cleanup: () => {
      consoleLogs.mockRestore();
      consoleErrors.mockRestore();
    },
  };
}

describe('scripts/policy-evaluate.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed when base/head SHAs are missing', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('GITHUB_EVENT_PATH', '/secure/github-event.json');
    const { fs } = await getMocks();
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      JSON.stringify({ pull_request: { body: 'x', base: { sha: null }, head: { sha: null } } }),
    );

    const { main } = await import('./policy-evaluate.ts');
    const code = await main();

    expect(code).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('fails closed when GITHUB_EVENT_PATH is not set', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { main } = await import('./policy-evaluate.ts');
    const code = await main();

    expect(code).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('fails closed when the GitHub event file cannot be read', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('GITHUB_EVENT_PATH', '/secure/github-event.json');
    const { fs } = await getMocks();
    vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
      throw new Error('read failed');
    });

    const { main } = await import('./policy-evaluate.ts');
    const code = await main();

    expect(code).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('returns 0 and writes outputs for ALLOW decisions (even when git diff fails)', async () => {
    const { fs, policy, consoleLogs, cleanup } = await setupTestScenario({
      prEvent: JSON.stringify({
        pull_request: { body: 'pr body', base: { sha: 'base' }, head: { sha: 'head' } },
      }),
      gitFails: true,
    });

    const { main } = await import('./policy-evaluate.ts');
    const code = await main();

    expect(code).toBe(0);
    expect(policy.evaluatePolicy).toHaveBeenCalledWith({
      prBody: 'pr body',
      changedFiles: [],
      failedCIChecks: [],
    });
    const writes = vi.mocked(fs.writeFileSync).mock.calls.map((c) => String(c[0]));
    expect(writes.some((p) => p.endsWith('policy.decision.json'))).toBe(true);
    expect(writes.some((p) => p.endsWith('policy.summary.md'))).toBe(true);
    expect(consoleLogs).toHaveBeenCalledWith('Policy decision: ALLOW');

    cleanup();
  });

  it('returns 0 for WARN decisions', async () => {
    const { consoleLogs, cleanup } = await setupTestScenario({ decision: 'warn' });

    const { main } = await import('./policy-evaluate.ts');
    expect(await main()).toBe(0);
    expect(consoleLogs).toHaveBeenCalledWith('Policy decision: WARN');

    cleanup();
  });

  it('returns 1 for DENY decisions and still attempts to write outputs', async () => {
    const { fs, consoleErrors, cleanup } = await setupTestScenario({ decision: 'deny' });

    const { main } = await import('./policy-evaluate.ts');
    expect(await main()).toBe(1);
    expect(consoleErrors).toHaveBeenCalledWith('Policy decision: DENY');
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();

    cleanup();
  });

  it('logs write errors but does not throw', async () => {
    const { fs, consoleErrors, cleanup } = await setupTestScenario();
    vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const { main } = await import('./policy-evaluate.ts');
    expect(await main()).toBe(0);
    expect(consoleErrors).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write'),
      expect.any(Error),
    );

    cleanup();
  });

  it('fetches CI checks and includes failures in policy evaluation', async () => {
    const { https, policy, cleanup } = await setupTestScenario({ withToken: true });

    mockHttpsGetError(https);

    const { main } = await import('./policy-evaluate.ts');
    expect(await main()).toBe(0);
    expect(policy.evaluatePolicy).toHaveBeenCalledWith({
      prBody: 'test body',
      changedFiles: ['src/file.ts'],
      failedCIChecks: [],
    });

    cleanup();
  });

  async function runCiFetchFailureScenario(
    testName: string,
    setupMock: (httpsMock: typeof import('node:https')) => void,
  ) {
    // eslint-disable-next-line vitest/valid-title
    it(testName, async () => {
      const { https, policy, consoleErrors, cleanup } = await setupTestScenario({
        withToken: true,
      });

      setupMock(https);

      const { main } = await import('./policy-evaluate.ts');
      expect(await main()).toBe(0);
      expect(consoleErrors).toHaveBeenCalledWith('Failed to fetch CI checks:', expect.any(Error));
      expect(policy.evaluatePolicy).toHaveBeenCalledWith({
        prBody: 'test body',
        changedFiles: ['src/file.ts'],
        failedCIChecks: [],
      });

      cleanup();
    });
  }

  runCiFetchFailureScenario('handles GitHub API errors gracefully', (https) => {
    mockHttpsGetError(https, true);
  });

  it('successfully fetches failed CI checks from GitHub API', async () => {
    const { https, policy, cleanup } = await setupTestScenario({ withToken: true });

    mockHttpsGetSuccess(https, {
      '/repos/test-owner/test-repo/commits/head-sha/status': {
        statuses: [
          { context: 'SonarQube', state: 'failure' },
          { context: 'CodeQL', state: 'error' },
          { context: 'Passing Check', state: 'success' },
        ],
      },
      '/repos/test-owner/test-repo/commits/head-sha/check-runs': {
        check_runs: [
          { name: 'Build', conclusion: 'failure' },
          { name: 'Lint', conclusion: 'cancelled' },
          { name: 'Tests', conclusion: 'success' },
        ],
      },
    });

    const { main } = await import('./policy-evaluate.ts');
    expect(await main()).toBe(0);
    expect(policy.evaluatePolicy).toHaveBeenCalledWith({
      prBody: 'test body',
      changedFiles: ['src/file.ts'],
      failedCIChecks: ['SonarQube', 'CodeQL', 'Build', 'Lint'],
    });

    cleanup();
  });

  runCiFetchFailureScenario('handles non-200 GitHub API status codes gracefully', (https) => {
    mockHttpsGetNon200(https, 404);
  });

  it('posts comment to PR on successful comment posting', async () => {
    const { https, consoleLogs, cleanup } = await setupTestScenario({ withToken: true });

    mockHttpsGetSuccess(https, {});
    mockHttpsRequestResult(https, 201);

    const { main } = await import('./policy-evaluate.ts');
    expect(await main()).toBe(0);
    expect(consoleLogs).toHaveBeenCalledWith('Posted policy decision comment to PR');
    expect(https.default.request).toHaveBeenCalled();

    cleanup();
  });

  it('handles comment posting failure gracefully', async () => {
    const { https, consoleLogs, consoleErrors, cleanup } = await setupTestScenario({
      withToken: true,
    });

    mockHttpsGetSuccess(https, {});
    mockHttpsRequestResult(https, 403);

    const { main } = await import('./policy-evaluate.ts');
    expect(await main()).toBe(0);
    expect(consoleErrors).toHaveBeenCalledWith('Failed to post PR comment:', expect.any(Error));
    expect(consoleLogs).not.toHaveBeenCalledWith('Posted policy decision comment to PR');

    cleanup();
  });

  it('generateCommentBody formats violations with remediations correctly', async () => {
    const { generateCommentBody } = await import('./policy-evaluate.ts');

    const violations = [
      {
        code: 'TEST_ERROR',
        message: 'Error message',
        severity: 'error',
        remediation: 'Fix the error',
      },
      {
        code: 'TEST_WARNING',
        message: 'Warning message',
        severity: 'warning',
        remediation: 'Fix the warning',
      },
    ];

    const body = generateCommentBody('deny', violations, '# Summary');

    expect(body).toContain('Policy Decision: DENY');
    expect(body).toContain('TEST_ERROR');
    expect(body).toContain('Error message');
    expect(body).toContain('TEST_WARNING');
    expect(body).toContain('Warning message');
    expect(body).toContain('### Remediation');
    expect(body).toContain('Fix the error');
    expect(body).toContain('Fix the warning');
    expect(body).toContain('# Summary');
  });

  async function runGenerateCommentBodyTest(
    decision: 'allow' | 'warn' | 'deny',
    violations: Array<{ code: string; message: string; severity: string }>,
    summary: string,
    shouldContain: string[],
    shouldNotContain: string[] = [],
  ) {
    const { generateCommentBody } = await import('./policy-evaluate.ts');
    const body = generateCommentBody(decision, violations, summary);

    for (const s of shouldContain) {
      expect(body).toContain(s);
    }
    for (const s of shouldNotContain) {
      expect(body).not.toContain(s);
    }
  }

  it('generateCommentBody formats deny decision without remediations', async () => {
    await runGenerateCommentBodyTest(
      'deny',
      [
        {
          code: 'NO_REMEDY',
          message: 'Issue without fix',
          severity: 'error',
        },
      ],
      '# Summary',
      ['❌', 'Policy Decision: DENY', 'NO_REMEDY'],
      ['### Remediation'],
    );
  });

  it('generateCommentBody formats allow decision', async () => {
    await runGenerateCommentBodyTest(
      'allow',
      [],
      '# All good',
      ['✅', 'Policy Decision: ALLOW', '# All good'],
      ['### Reasons'],
    );
  });

  it('generateCommentBody formats warn decision with violations', async () => {
    await runGenerateCommentBodyTest(
      'warn',
      [
        {
          code: 'WARN_CODE',
          message: 'Warning issue',
          severity: 'warning',
        },
      ],
      '# Warning',
      ['⚠️', 'Policy Decision: WARN', 'WARN_CODE', 'Warning issue'],
    );
  });
});
