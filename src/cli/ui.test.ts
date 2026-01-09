/**
 * Political Sphere — UI Tests (coverage-focused)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      TERM?: string;
    }
  }
}

/* eslint-enable @typescript-eslint/no-namespace */

import type { LinterConfig } from './linters.ts';

let outputFrames: string[] = [];
let hookIndex = 0;
let hookState: unknown[] = [];
let effectQueue: Array<() => void> = [];
let rerender: (() => void) | undefined;

const Fragment = Symbol('Fragment');

const createInkMock = (renderImplementation?: (...args: unknown[]) => unknown) => ({
  __esModule: true,
  Box: ({ children }: { children?: unknown }) => children ?? null,
  Text: ({ children }: { children?: unknown }) => children ?? null,
  render: renderImplementation ?? (() => {}),
});

const resetHooks = () => {
  hookIndex = 0;
  hookState = [];
  effectQueue = [];
  rerender = undefined;
  outputFrames = [];
};

const createElement = (
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: unknown[]
) => ({
  type,
  props: { ...props, children: children.length <= 1 ? children[0] : children },
});

const useState = <T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] => {
  const index = hookIndex++;
  if (hookState[index] === undefined) {
    hookState[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
  }
  const setState = (next: T | ((prev: T) => T)) => {
    const current = hookState[index] as T;
    hookState[index] = typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
    rerender?.();
  };
  return [hookState[index] as T, setState];
};

const useEffect = (effect: () => undefined | (() => void)) => {
  effectQueue.push(() => {
    effect();
  });
};

const useMemo = <T>(factory: () => T) => factory();

const renderNode = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((item) => renderNode(item)).join('');
  }
  if (typeof node === 'object' && node != null && 'type' in node) {
    const element = node as { type: unknown; props?: { children?: unknown } };
    if (element.type === Fragment) {
      return renderNode(element.props?.children);
    }
    if (typeof element.type === 'function') {
      return renderNode(
        (element.type as (props: Record<string, unknown>) => unknown)(element.props ?? {}),
      );
    }
    return renderNode(element.props?.children);
  }
  return '';
};

async function loadUiModule() {
  vi.resetModules();
  vi.doMock('react', () => ({
    __esModule: true,
    default: { createElement, Fragment },
    createElement,
    Fragment,
    useEffect,
    useMemo,
    useCallback: <T>(callback: T) => callback,
    useState,
  }));
  vi.doMock('ink', async () => {
    return createInkMock((node: unknown) => {
      const root = node;
      const performRender = () => {
        hookIndex = 0;
        effectQueue = [];
        const output = renderNode(root);
        outputFrames.push(output);
        for (const effect of effectQueue) {
          effect();
        }
      };
      rerender = performRender;
      performRender();
      return { unmount: () => {} };
    });
  });
  vi.doMock('ink-spinner', () => ({
    __esModule: true,
    default: () => 'spinner',
  }));
  return import('./ui.tsx');
}

const makeLinter = (id: string, name: string): LinterConfig => ({
  id,
  name,
  binary: 'bin',
  args: [],
  timeoutMs: 1,
  mode: 'direct',
  risk: 'low',
  enforcement: 'advisory',
  description: `${name} linter`,
});

describe('Political Sphere — UI', () => {
  const tmpDir = (process.env.TMPDIR ?? '/tmp').replace(/\/$/, '');
  const TERM_KEY = 'TERM' as const;
  const TERM_PROGRAM_KEY = 'TERM_PROGRAM' as const;
  const NO_COLOR_KEY = 'NO_COLOR' as const;
  let originalTerm: string | undefined;
  let originalTermProgram: string | undefined;
  let originalNoColor: string | undefined;

  beforeEach(() => {
    resetHooks();
    originalTerm = process.env[TERM_KEY];
    originalTermProgram = process.env[TERM_PROGRAM_KEY];
    originalNoColor = process.env[NO_COLOR_KEY];
  });

  afterEach(() => {
    if (originalTerm === undefined) {
      delete process.env[TERM_KEY];
    } else {
      process.env[TERM_KEY] = originalTerm;
    }

    if (originalTermProgram === undefined) {
      delete process.env[TERM_PROGRAM_KEY];
    } else {
      process.env[TERM_PROGRAM_KEY] = originalTermProgram;
    }

    if (originalNoColor === undefined) {
      delete process.env[NO_COLOR_KEY];
    } else {
      process.env[NO_COLOR_KEY] = originalNoColor;
    }

    vi.restoreAllMocks();
    vi.resetModules();
    vi.unmock('ink');
    vi.unmock('ink-spinner');
    vi.unmock('react');
  });

  describe('utility coverage', () => {
    it('supportsOsc8 returns true for iTerm/WezTerm and false for linux console', async () => {
      const { __test__ } = await loadUiModule();
      const { supportsOsc8 } = __test__;

      process.env[TERM_PROGRAM_KEY] = 'iTerm.app';
      expect(supportsOsc8()).toBe(true);

      process.env[TERM_PROGRAM_KEY] = 'WezTerm';
      expect(supportsOsc8()).toBe(true);

      delete process.env[TERM_PROGRAM_KEY];
      process.env[TERM_KEY] = 'linux';
      expect(supportsOsc8()).toBe(false);
    });

    it('supportsOsc8 falls back to TERM when not linux', async () => {
      const { __test__ } = await loadUiModule();
      const { supportsOsc8 } = __test__;

      delete process.env[TERM_PROGRAM_KEY];
      process.env[TERM_KEY] = 'xterm-256color';
      expect(supportsOsc8()).toBe(true);
    });

    it('supportsColor respects NO_COLOR and TERM=dumb', async () => {
      const { __test__ } = await loadUiModule();
      const { supportsColor } = __test__;

      process.env[NO_COLOR_KEY] = '1';
      expect(supportsColor()).toBe(false);

      delete process.env[NO_COLOR_KEY];
      process.env[TERM_KEY] = 'dumb';
      expect(supportsColor()).toBe(false);

      process.env[TERM_KEY] = 'xterm-256color';
      expect(supportsColor()).toBe(true);
    });

    it('supportsColor returns true when TERM is unset and NO_COLOR is absent', async () => {
      const { __test__ } = await loadUiModule();
      const { supportsColor } = __test__;

      delete process.env[NO_COLOR_KEY];
      delete process.env[TERM_KEY];

      expect(supportsColor()).toBe(true);
    });

    it('initializes ANSI fallbacks when colors are disabled', async () => {
      process.env[NO_COLOR_KEY] = '1';
      delete process.env[TERM_KEY];

      const { __test__, renderWaitingHeader, WAITING_HEADER_MESSAGE } = await loadUiModule();

      let staticOutput = '';
      const stdout = {
        isTTY: false,
        write: (chunk: string) => {
          staticOutput += chunk;
          return true;
        },
      } as unknown as NodeJS.WriteStream;

      const view = renderWaitingHeader(WAITING_HEADER_MESSAGE, { stdout, stderr: stdout });

      expect(__test__.supportsColor()).toBe(false);
      expect(staticOutput).not.toContain('\u001b[');

      view.unmount();
    });
  });

  it('renders all statuses, hyperlinks when supported, and completes', async () => {
    process.env[TERM_KEY] = 'xterm-256color';

    const { renderDashboard } = await loadUiModule();
    const ttyStream: NodeJS.WriteStream = { ...process.stdout, isTTY: true };
    const linters: LinterConfig[] = [
      makeLinter('pending', 'Pending'),
      makeLinter('running', 'Running'),
      makeLinter('pass', 'Pass'),
      makeLinter('fail', 'Fail'),
      makeLinter('error', 'Error'),
      makeLinter('skipped', 'Skipped'),
    ];

    const { updateStatus, waitForExit } = renderDashboard(linters, `${tmpDir}/test-logs`, {
      stdout: ttyStream,
      stderr: ttyStream,
    });

    // Call before effects have subscribed (no-op branch).
    updateStatus('pending', 'RUNNING');

    updateStatus('running', 'RUNNING');
    updateStatus('pass', 'PASS');
    updateStatus('fail', 'FAIL');
    updateStatus('error', 'ERROR');
    updateStatus('skipped', 'SKIPPED');

    const outputWithLinks = outputFrames.join('');
    expect(outputWithLinks).toContain('PENDING');
    expect(outputWithLinks).toContain('RUNNING');
    expect(outputWithLinks).toContain('PASS');
    expect(outputWithLinks).toContain('FAIL');
    expect(outputWithLinks).toContain('ERROR');
    expect(outputWithLinks).toContain('SKIPPED');
    expect(outputWithLinks).toContain(']8;;file://');

    outputFrames = [];
    process.env[TERM_KEY] = 'dumb';

    updateStatus('running', 'PASS');

    const outputNoLinks = outputFrames.join('');
    expect(outputNoLinks).toContain(`${tmpDir}/test-logs/running.log`);
    expect(outputNoLinks).not.toContain(']8;;');

    updateStatus('pending', 'PASS');

    await waitForExit();

    const finalOutput = outputFrames.join('');
    expect(finalOutput).toContain('Summary');
    expect(finalOutput).toContain('Duration');
  });

  it('renders a static dashboard when stdout is not TTY', async () => {
    const { renderDashboard } = await loadUiModule();
    const linters: LinterConfig[] = [
      makeLinter('pending', 'Pending'),
      makeLinter('running', 'Running'),
      makeLinter('pass', 'Pass'),
      makeLinter('fail', 'Fail'),
      makeLinter('error', 'Error'),
      makeLinter('skipped', 'Skipped'),
    ];
    let output = '';
    const stdout = {
      isTTY: false,
      write: (chunk: string) => {
        output += chunk;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    const { updateStatus, waitForExit } = renderDashboard(linters, `${tmpDir}/test-logs`, {
      stdout,
      stderr: stdout,
    });

    updateStatus('running', 'RUNNING');
    updateStatus('pass', 'PASS');
    updateStatus('fail', 'FAIL');
    updateStatus('error', 'ERROR');
    updateStatus('skipped', 'SKIPPED');
    updateStatus('missing', 'PASS');
    await waitForExit();
    await waitForExit();

    expect(output).toContain('POLITICAL SPHERE — CI LINTING');
    expect(output).toContain('✔ PASS');
    expect(output).toContain('✘ FAIL');
    expect(output).toContain('⚠ ERROR');
    expect(output).toContain('SKIPPED');
    expect(output).toContain('PENDING');
    expect(output).toContain('RUNNING');
    expect(output).toContain(`${tmpDir}/test-logs/pass.log`);
    expect(output).toContain('\u001b[');
  });

  it('buffers status updates until listener is registered', async () => {
    process.env.TERM = 'xterm-256color';

    // Test the pending buffer by intercepting the subscribe call
    vi.resetModules();
    let capturedSubscribe: ((l: (id: string, status: string) => void) => void) | undefined;

    // Extract render logic to reduce nesting
    const createPerformRender = (root: unknown) => {
      return () => {
        hookIndex = 0;
        effectQueue = [];
        const output = renderNode(root);
        outputFrames.push(output);
        // Run effects AFTER we've had a chance to call updateStatus
      };
    };

    const createInkRender = () => {
      return (node: unknown, _options: unknown) => {
        // Intercept the render to capture subscribe before effects run
        const element = node as {
          props?: { subscribe?: (l: (id: string, status: string) => void) => void };
        };
        if (element?.props?.subscribe) {
          capturedSubscribe = element.props.subscribe;
        }

        const root = node;
        const performRender = createPerformRender(root);
        rerender = performRender;
        performRender();
        return { unmount: () => {} };
      };
    };

    vi.doMock('react', () => ({
      __esModule: true,
      default: { createElement, Fragment },
      createElement,
      Fragment,
      useEffect: (effect: () => undefined | (() => void)) => {
        effectQueue.push(() => effect());
      },
      useMemo: <T>(factory: () => T) => factory(),
      useCallback: <T>(callback: T) => callback,
      useState,
    }));
    vi.doMock('ink', async () => {
      return {
        __esModule: true,
        Box: ({ children }: { children?: unknown }) => children ?? null,
        Text: ({ children }: { children?: unknown }) => children ?? null,
        render: createInkRender(),
      };
    });
    vi.doMock('ink-spinner', () => ({
      __esModule: true,
      default: () => 'spinner',
    }));

    const { renderDashboard } = await import('./ui.tsx');
    const linters: LinterConfig[] = [makeLinter('test', 'Test')];
    const ttyStream: NodeJS.WriteStream = { ...process.stdout, isTTY: true };

    // Grab updateStatus but DON'T run effects yet
    const { updateStatus } = renderDashboard(linters, `${tmpDir}/test-logs`, {
      stdout: ttyStream,
      stderr: ttyStream,
    });

    // Push to pending BEFORE subscribe is called (line 390)
    updateStatus('test', 'RUNNING');
    updateStatus('test', 'PASS');

    // Now manually call subscribe which should flush the pending buffer (lines 372-373)
    const flushedEvents: Array<{ id: string; status: string }> = [];
    if (capturedSubscribe) {
      capturedSubscribe((id, status) => {
        flushedEvents.push({ id, status });
      });
    }

    expect(flushedEvents).toEqual([
      { id: 'test', status: 'RUNNING' },
      { id: 'test', status: 'PASS' },
    ]);
  });

  it('uses process streams when no streams are provided', async () => {
    const { renderDashboard } = await loadUiModule();
    const linters: LinterConfig[] = [makeLinter('eslint', 'ESLint')];

    const { updateStatus, waitForExit } = renderDashboard(linters, `${tmpDir}/test-logs`);

    updateStatus('eslint', 'PASS');
    await waitForExit();
    expect(typeof updateStatus).toBe('function');
  });

  it('renders the waiting header message in TTY and static modes', async () => {
    const { renderWaitingHeader, WAITING_HEADER_MESSAGE } = await loadUiModule();

    outputFrames = [];
    const ttyStream: NodeJS.WriteStream = { ...process.stdout, isTTY: true };

    const ttyView = renderWaitingHeader(WAITING_HEADER_MESSAGE, {
      stdout: ttyStream,
      stderr: ttyStream,
    });

    const ttyOutput = outputFrames.join('');
    expect(ttyOutput).toContain(WAITING_HEADER_MESSAGE);
    ttyView.unmount();

    let staticOutput = '';
    const stdout = {
      isTTY: false,
      write: (chunk: string) => {
        staticOutput += chunk;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    renderWaitingHeader(WAITING_HEADER_MESSAGE, { stdout, stderr: stdout });
    expect(staticOutput).toContain(WAITING_HEADER_MESSAGE);
  });

  it('uses default process streams when no streams parameter is provided', async () => {
    const { renderWaitingHeader, WAITING_HEADER_MESSAGE } = await loadUiModule();

    // Test the default parameter fallback for streams?.stdout and streams?.stderr
    outputFrames = [];
    const result = renderWaitingHeader(WAITING_HEADER_MESSAGE);

    expect(typeof result.unmount).toBe('function');
    result.unmount();
  });
});
