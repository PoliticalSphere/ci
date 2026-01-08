import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('node:fs', () => ({ readFileSync: vi.fn(), writeFileSync: vi.fn() }));
vi.mock('../src/policy/decision.ts', () => ({
  evaluatePolicy: vi.fn(),
  generateMarkdownSummary: vi.fn(),
  serializeToJSON: vi.fn(),
}));

type EvaluatePolicyOutput = import('../src/policy/decision.ts').EvaluatePolicyOutput;

const NO_RULES_DECISION_TRAIL: EvaluatePolicyOutput['result']['decisionTrail'] = [
  {
    rule: 'NO_RULES_TRIGGERED',
    before: 'allow',
    after: 'allow',
    detail: 'No policy violations detected',
  },
];

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
    classification: {
      tier: 'low',
      paths: [],
      reasons: [],
      ...classification,
    },
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
}

const getMocks = async () => {
  const childProcess = await import('node:child_process');
  const fs = await import('node:fs');
  const policy = await import('../src/policy/decision.ts');
  return { childProcess, fs, policy };
};

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
    vi.stubEnv('GITHUB_EVENT_PATH', '/tmp/event.json');
    const { fs } = await getMocks();
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      JSON.stringify({ pull_request: { body: 'x', base: { sha: null }, head: { sha: null } } }),
    );

    const { main } = await import('./policy-evaluate.ts');
    const code = main();

    expect(code).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('fails closed when GITHUB_EVENT_PATH is not set', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { main } = await import('./policy-evaluate.ts');
    const code = main();

    expect(code).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('fails closed when the GitHub event file cannot be read', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('GITHUB_EVENT_PATH', '/tmp/event.json');
    const { fs } = await getMocks();
    vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
      throw new Error('read failed');
    });

    const { main } = await import('./policy-evaluate.ts');
    const code = main();

    expect(code).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('returns 0 and writes outputs for ALLOW decisions (even when git diff fails)', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('GITHUB_EVENT_PATH', '/tmp/event.json');
    const { childProcess, fs, policy } = await getMocks();
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      JSON.stringify({
        pull_request: { body: 'pr body', base: { sha: 'base' }, head: { sha: 'head' } },
      }),
    );

    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      throw new Error('git failed');
    });

    const outAllow = makePolicyOutput('allow', 0);
    vi.mocked(policy.evaluatePolicy).mockReturnValueOnce(outAllow);
    vi.mocked(policy.serializeToJSON).mockReturnValueOnce('{"decision":"allow"}');
    vi.mocked(policy.generateMarkdownSummary).mockReturnValueOnce('# ok');

    const { main } = await import('./policy-evaluate.ts');
    const code = main();

    expect(code).toBe(0);
    expect(policy.evaluatePolicy).toHaveBeenCalledWith({ prBody: 'pr body', changedFiles: [] });

    const writes = vi.mocked(fs.writeFileSync).mock.calls.map((c) => String(c[0]));
    expect(writes.some((p) => p.endsWith('policy.decision.json'))).toBe(true);
    expect(writes.some((p) => p.endsWith('policy.summary.md'))).toBe(true);
    expect(consoleLogSpy).toHaveBeenCalledWith('Policy decision: ALLOW');

    consoleLogSpy.mockRestore();
  });

  it('returns 0 for WARN decisions', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('GITHUB_EVENT_PATH', '/tmp/event.json');
    const { childProcess, fs, policy } = await getMocks();
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      JSON.stringify({ pull_request: { body: '', base: { sha: 'b' }, head: { sha: 'h' } } }),
    );

    vi.mocked(childProcess.execFileSync).mockReturnValueOnce('src/file.ts\n');

    const outWarn = makePolicyOutput('warn', 1, { paths: ['p'], reasons: ['r'] });
    vi.mocked(policy.evaluatePolicy).mockReturnValueOnce(outWarn);
    vi.mocked(policy.serializeToJSON).mockReturnValueOnce('{"decision":"warn"}');
    vi.mocked(policy.generateMarkdownSummary).mockReturnValueOnce('# warn');

    const { main } = await import('./policy-evaluate.ts');
    const code = main();

    expect(code).toBe(0);
    expect(consoleLogSpy).toHaveBeenCalledWith('Policy decision: WARN');

    consoleLogSpy.mockRestore();
  });

  it('returns 1 for DENY decisions and still attempts to write outputs', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('GITHUB_EVENT_PATH', '/tmp/event.json');
    const { childProcess, fs, policy } = await getMocks();
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      JSON.stringify({ pull_request: { body: '', base: { sha: 'b' }, head: { sha: 'h' } } }),
    );

    vi.mocked(childProcess.execFileSync).mockReturnValueOnce('src/file.ts\n');

    const outDeny = makePolicyOutput('deny', 1);
    vi.mocked(policy.evaluatePolicy).mockReturnValueOnce(outDeny);
    vi.mocked(policy.serializeToJSON).mockReturnValueOnce('{"decision":"deny"}');
    vi.mocked(policy.generateMarkdownSummary).mockReturnValueOnce('# deny');

    const { main } = await import('./policy-evaluate.ts');
    const code = main();

    expect(code).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Policy decision: DENY');
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('logs write errors but does not throw', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('GITHUB_EVENT_PATH', '/tmp/event.json');
    const { childProcess, fs, policy } = await getMocks();
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      JSON.stringify({ pull_request: { body: '', base: { sha: 'b' }, head: { sha: 'h' } } }),
    );
    vi.mocked(childProcess.execFileSync).mockReturnValueOnce('src/file.ts\n');

    const outAllow2 = makePolicyOutput('allow', 1);
    vi.mocked(policy.evaluatePolicy).mockReturnValueOnce(outAllow2);
    vi.mocked(policy.serializeToJSON).mockReturnValueOnce('{"decision":"allow"}');
    vi.mocked(policy.generateMarkdownSummary).mockReturnValueOnce('# ok');

    vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const { main } = await import('./policy-evaluate.ts');
    const code = main();

    expect(code).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write'),
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });
});
