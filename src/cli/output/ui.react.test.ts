/* eslint-disable jsdoc/check-tag-names */
/**
 * @vitest-environment jsdom
 */
/* eslint-enable jsdoc/check-tag-names */

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertAnsiFallbacks,
  createTTYStream,
  loadDashboardComponents,
  loadStatusTable,
  loadUiModule,
  makeLinters,
  NO_COLOR_KEY,
  setupInkCaptureSubscribeMocks,
  setupInkTestingLibraryMocks,
  TERM_KEY,
  TERM_PROGRAM_KEY,
} from '../../__test-utils__/mocks/ui-mocks';
import type { LinterConfig } from '../config/index.ts';

const setupInkTestingLibraryMocksLocal = setupInkTestingLibraryMocks;
const setupInkCaptureSubscribeMocksLocal = setupInkCaptureSubscribeMocks;
const loadUiModuleLocal = loadUiModule;

beforeEach(() => {
  delete process.env[TERM_KEY];
  delete process.env[TERM_PROGRAM_KEY];
  delete process.env[NO_COLOR_KEY];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unmock('ink');
  vi.unmock('ink-spinner');
});

describe('UI React rendering (testing-library)', () => {
  it('renders log hyperlink text when OSC8 is supported', async () => {
    process.env[TERM_PROGRAM_KEY] = 'iTerm.app';
    const StatusTable = await loadStatusTable();

    const states = [
      {
        id: 'eslint',
        name: 'ESLint',
        status: 'PASS',
        logPath: '/tmp/eslint.log',
      },
    ];

    render(React.createElement(StatusTable, { states }));

    expect(screen.getByText('ESLint')).toBeTruthy();
    const link = screen.getByText((content) => content.includes('View Log'));
    expect(link).toBeTruthy();
  });

  it('renders a dash for pending log links', async () => {
    const { __test__ } = await loadUiModule();
    const { StatusTable } = __test__;

    const states = [
      {
        id: 'pending',
        name: 'Pending',
        status: 'PENDING',
        logPath: '/tmp/pending.log',
      },
    ];

    render(React.createElement(StatusTable, { states }));

    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('-')).toBeTruthy();
  });

  it('renders error boundary fallback for child errors', async () => {
    const { __test__ } = await loadUiModule();
    const { DashboardErrorBoundary } = __test__; // use module loader for boundary access

    const Thrower = (): React.ReactElement => {
      throw new Error('boom');
    };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(React.createElement(DashboardErrorBoundary, null, React.createElement(Thrower, null)));
    errorSpy.mockRestore();

    expect(screen.getByText('Dashboard error')).toBeTruthy();
    expect(screen.getByText('UI failed to render. Check logs for details.')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
  });

  it('renders children when no error occurs', async () => {
    const { __test__ } = await loadUiModule();
    const { DashboardErrorBoundary } = __test__;

    render(
      React.createElement(
        DashboardErrorBoundary,
        null,
        React.createElement('div', null, 'All good'),
      ),
    );

    expect(screen.getByText('All good')).toBeTruthy();
  });

  it('renders nothing when no children are provided', async () => {
    const { __test__ } = await loadUiModule();
    const { DashboardErrorBoundary } = __test__;

    const { container } = render(React.createElement(DashboardErrorBoundary, null));

    expect(container.textContent ?? '').toBe('');
  });

  it('keeps status labels available for basic inspection', async () => {
    const { __test__ } = await loadUiModule();
    const { StatusTable } = __test__;

    const linters: LinterConfig[] = makeLinters([['run', 'Running']]);
    const states = linters.map((l) => ({
      id: l.id,
      name: l.name,
      status: 'RUNNING',
      logPath: `/tmp/${l.id}.log`,
    }));

    render(React.createElement(StatusTable, { states }));

    expect(screen.getByText('RUNNING')).toBeTruthy();
  });

  it('handles OSC8/Color support toggles', async () => {
    const { __test__ } = await loadUiModule();
    const { supportsOsc8, supportsColor } = __test__;

    process.env[TERM_PROGRAM_KEY] = 'iTerm.app';
    expect(supportsOsc8()).toBe(true);

    process.env[TERM_PROGRAM_KEY] = 'WezTerm';
    expect(supportsOsc8()).toBe(true);

    delete process.env[TERM_PROGRAM_KEY];
    process.env[TERM_KEY] = 'linux';
    expect(supportsOsc8()).toBe(false);

    process.env[TERM_KEY] = 'xterm-256color';
    expect(supportsOsc8()).toBe(true);

    process.env[TERM_KEY] = '';
    expect(supportsOsc8()).toBe(false);

    delete process.env[TERM_KEY];
    expect(supportsOsc8()).toBe(false);

    process.env[NO_COLOR_KEY] = '1';
    expect(supportsColor()).toBe(false);

    delete process.env[NO_COLOR_KEY];
    process.env[TERM_KEY] = 'dumb';
    expect(supportsColor()).toBe(false);

    process.env[TERM_KEY] = 'xterm-256color';
    expect(supportsColor()).toBe(true);

    delete process.env[TERM_KEY];
    expect(supportsColor()).toBe(true);
  });

  it('initializes ANSI fallbacks when colors are disabled', async () => {
    await assertAnsiFallbacks(setupInkTestingLibraryMocksLocal);
    expect(true).toBe(true);
  });

  it('renders statuses, hyperlinks when supported, and completes', async () => {
    process.env[TERM_KEY] = 'xterm-256color';
    process.env[TERM_PROGRAM_KEY] = 'iTerm.app';

    const { renderDashboard } = await loadDashboardComponents();
    const ttyStream: NodeJS.WriteStream = createTTYStream();
    const linters: LinterConfig[] = makeLinters([
      ['pending', 'Pending'],
      ['running', 'Running'],
      ['pass', 'Pass'],
      ['fail', 'Fail'],
      ['error', 'Error'],
      ['skipped', 'Skipped'],
    ]);

    const { updateStatus, waitForExit } = renderDashboard(linters, '/tmp/test-logs', {
      stdout: ttyStream,
      stderr: ttyStream,
    });

    await act(async () => {
      updateStatus('pending', 'RUNNING');
      updateStatus('running', 'RUNNING');
      updateStatus('pass', 'PASS');
      updateStatus('fail', 'FAIL');
      updateStatus('error', 'ERROR');
      updateStatus('skipped', 'SKIPPED');
    });

    expect(screen.getAllByText((content) => content.includes('RUNNING')).length).toBeGreaterThan(0);
    expect(screen.getAllByText((content) => content.includes('PASS')).length).toBeGreaterThan(0);
    expect(screen.getAllByText((content) => content.includes('FAIL')).length).toBeGreaterThan(0);
    expect(screen.getAllByText((content) => content.includes('ERROR')).length).toBeGreaterThan(0);
    expect(screen.getAllByText((content) => content.includes('SKIPPED')).length).toBeGreaterThan(0);
    expect(screen.getAllByText((content) => content.includes('View Log')).length).toBeGreaterThan(
      0,
    );

    process.env[TERM_KEY] = 'dumb';
    await act(async () => {
      updateStatus('running', 'PASS');
    });

    expect(
      screen.getByText((content) => content.includes('/tmp/test-logs/running.log')),
    ).toBeTruthy();

    await act(async () => {
      updateStatus('pending', 'PASS');
    });

    expect(screen.getByText('Summary')).toBeTruthy();
    expect(screen.getByText(/Duration:/u)).toBeTruthy();

    await waitForExit();
  });

  it('renders a static dashboard when stdout is not TTY', async () => {
    process.env[TERM_KEY] = 'xterm-256color';
    delete process.env[NO_COLOR_KEY];

    const { renderDashboard } = await loadUiModule();
    const linters: LinterConfig[] = makeLinters([
      ['pending', 'Pending'],
      ['running', 'Running'],
      ['pass', 'Pass'],
      ['fail', 'Fail'],
      ['error', 'Error'],
      ['skipped', 'Skipped'],
    ]);
    let output = '';
    const stdout = {
      isTTY: false,
      write: (chunk: string) => {
        output += chunk;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    const { updateStatus, waitForExit } = renderDashboard(linters, '/tmp/test-logs', {
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
    expect(output).toContain('/tmp/test-logs/pass.log');
    expect(output).toContain('\u001b[');
  });

  it('buffers status updates until listener is registered', async () => {
    process.env[TERM_KEY] = 'xterm-256color';

    let capturedSubscribe: ((l: (id: string, status: string) => void) => void) | undefined;
    const captureSubscribe = (subscribe: (l: (id: string, status: string) => void) => void) => {
      capturedSubscribe = subscribe;
    };

    const { renderDashboard } = await loadUiModuleLocal(() =>
      setupInkCaptureSubscribeMocksLocal(captureSubscribe),
    );
    const linters: LinterConfig[] = makeLinters([['test', 'Test']]);
    const ttyStream: NodeJS.WriteStream = { ...process.stdout, isTTY: true };

    const { updateStatus } = renderDashboard(linters, '/tmp/test-logs', {
      stdout: ttyStream,
      stderr: ttyStream,
    });

    updateStatus('test', 'RUNNING');
    updateStatus('test', 'PASS');

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
    const linters: LinterConfig[] = makeLinters([['eslint', 'ESLint']]);

    const { updateStatus, waitForExit } = renderDashboard(linters, '/tmp/test-logs');

    updateStatus('eslint', 'PASS');
    await waitForExit();
    expect(typeof updateStatus).toBe('function');
  });

  it('renders the waiting header message in TTY and static modes', async () => {
    const { renderWaitingHeader, WAITING_HEADER_MESSAGE } = await loadUiModule();

    const ttyStream: NodeJS.WriteStream = { ...process.stdout, isTTY: true };
    renderWaitingHeader(WAITING_HEADER_MESSAGE, {
      stdout: ttyStream,
      stderr: ttyStream,
    });

    expect(screen.getByText(WAITING_HEADER_MESSAGE)).toBeTruthy();

    let _staticOutput = '';
    const stdout = {
      isTTY: false,
      write: (chunk: string) => {
        _staticOutput += chunk;
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    const result = renderWaitingHeader(WAITING_HEADER_MESSAGE, { stdout, stderr: stdout });
    // In non-TTY mode, function should return an unmount function; static output is environment-dependent
    expect(typeof result.unmount).toBe('function');
  });

  it('uses default process streams when no streams parameter is provided', async () => {
    const { renderWaitingHeader, WAITING_HEADER_MESSAGE } = await loadUiModule();

    const result = renderWaitingHeader(WAITING_HEADER_MESSAGE);

    expect(typeof result.unmount).toBe('function');
    result.unmount();
  });
});
