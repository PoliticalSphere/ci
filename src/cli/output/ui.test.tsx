import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { __test__ } from './ui.tsx';

type TerminalStatus = 'PENDING' | 'PASS' | 'FAIL' | 'ERROR' | 'SKIPPED';

type LinterState = {
  readonly id: string;
  readonly name: string;
  readonly status: TerminalStatus;
  readonly logPath: string;
};

const { renderStaticDashboard, renderStaticHeader } = __test__;

const ESC = String.fromCodePoint(27);

const stripAnsi = (value: string): string => {
  let out = '';
  let start = 0;
  while (true) {
    const escIndex = value.indexOf(ESC, start);
    if (escIndex === -1) {
      out += value.slice(start);
      break;
    }
    out += value.slice(start, escIndex);
    if (value[escIndex + 1] === '[') {
      const mIndex = value.indexOf('m', escIndex + 2);
      if (mIndex === -1) {
        // malformed sequence; append rest and exit
        out += value.slice(escIndex);
        break;
      }
      start = mIndex + 1;
    } else {
      // not an ANSI CSI sequence; include ESC and move past it
      out += ESC;
      start = escIndex + 1;
    }
  }
  return out;
};

const collect = (stream: PassThrough): string => {
  let output = '';
  stream.on('data', (chunk: Buffer | string) => {
    output += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  });
  return output;
};

describe('renderStaticDashboard', () => {
  it('renders summary for empty state list without throwing', () => {
    const stdout = new PassThrough();
    const output = collect(stdout);

    renderStaticDashboard([], 0, stdout as unknown as NodeJS.WriteStream);

    const cleaned = stripAnsi(output);
    expect(cleaned).toContain('Summary');
    expect(cleaned).toContain('Total: 0');
  });

  it('renders pending and completed rows with log paths', () => {
    const stdout = new PassThrough();
    const output = collect(stdout);

    const states: LinterState[] = [
      { id: 'lint1', name: 'Lint One', status: 'PENDING', logPath: '/tmp/lint1.log' },
      { id: 'lint2', name: 'Lint Two', status: 'PASS', logPath: '/tmp/lint2.log' },
    ];

    renderStaticDashboard(states, 1250, stdout as unknown as NodeJS.WriteStream);

    const cleaned = stripAnsi(output);
    expect(cleaned).toContain('Lint One');
    expect(cleaned).toContain('-'); // Pending entries show dash for log path
    expect(cleaned).toContain('/tmp/lint2.log');
    expect(cleaned).toContain('Duration: 1.25s');
  });

  it('includes summary counts for pass/fail/error/skipped', () => {
    const stdout = new PassThrough();
    const output = collect(stdout);

    const states: LinterState[] = [
      { id: 'pass', name: 'Pass', status: 'PASS', logPath: '/tmp/pass.log' },
      { id: 'fail', name: 'Fail', status: 'FAIL', logPath: '/tmp/fail.log' },
      { id: 'error', name: 'Error', status: 'ERROR', logPath: '/tmp/error.log' },
      { id: 'skip', name: 'Skip', status: 'SKIPPED', logPath: '/tmp/skip.log' },
    ];

    renderStaticDashboard(states, 2000, stdout as unknown as NodeJS.WriteStream);

    const cleaned = stripAnsi(output);
    expect(cleaned).toContain('Total: 4');
    expect(cleaned).toContain('Pass: 1');
    expect(cleaned).toContain('Fail: 1');
    expect(cleaned).toContain('Error: 1');
    expect(cleaned).toContain('Skipped: 1');
  });
});

describe('renderStaticHeader', () => {
  it('prints header and message', () => {
    const stdout = new PassThrough();
    const output = collect(stdout);

    renderStaticHeader('Waiting on linters...', stdout as unknown as NodeJS.WriteStream);

    const cleaned = stripAnsi(output);
    expect(cleaned).toContain('POLITICAL SPHERE — CI LINTING');
    expect(cleaned).toContain('Waiting on linters');
    expect(cleaned.split('\n').length).toBeGreaterThan(1);
  });
});
