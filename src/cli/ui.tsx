/**
 * Political Sphere — Ink Dashboard
 *
 * Role:
 *   Read-only, deterministic rendering of linter execution state.
 *
 * Guarantees:
 *   - No business logic
 *   - No policy decisions
 *   - Stable rendering under rapid updates
 *
 * Non-goals:
 *   - Progress estimation
 *   - Execution control
 */

import pathLib from 'node:path';
import { pathToFileURL } from 'node:url';

import { Box, render, Text } from 'ink';
import Spinner from 'ink-spinner';
import React, { useEffect, useMemo, useState } from 'react';
import type { LinterStatus } from './executor.ts';
import type { LinterConfig } from './linters.ts';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type TerminalStatus = LinterStatus;

interface LinterState {
  readonly id: string;
  readonly name: string;
  readonly status: TerminalStatus;
  readonly logPath: string;
}

interface DashboardProps {
  readonly linters: readonly LinterConfig[];
  readonly logDir: string;
  readonly onComplete: () => void;
  readonly subscribe: (listener: (id: string, status: TerminalStatus) => void) => void;
}

interface DashboardStreams {
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function supportsOsc8(): boolean {
  // biome-ignore lint/complexity/useLiteralKeys: Access via index signature satisfies TS4111
  const term = process.env['TERM'];
  // biome-ignore lint/complexity/useLiteralKeys: Access via index signature satisfies TS4111
  const termProgram = process.env['TERM_PROGRAM'];

  // Known terminals with excellent OSC8 support
  if (termProgram === 'iTerm.app' || termProgram === 'WezTerm') {
    return true;
  }

  // Linux console doesn't support OSC8
  if (typeof term === 'string' && term.includes('linux')) {
    return false;
  }

  // Fallback to basic TERM check
  return typeof term === 'string' && term !== '' && term !== 'dumb';
}

function createHyperlink(text: string, url: string): string {
  return `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
}

/**
 * Detects if color output is supported.
 * Respects NO_COLOR environment variable standard: https://no-color.org/
 * Note: We don't check isTTY here because the static renderer uses ANSI codes even in non-TTY mode.
 */
const supportsColor = (): boolean => {
  // biome-ignore lint/complexity/useLiteralKeys: Access via index signature satisfies TS4111
  if (process.env['NO_COLOR'] !== undefined) {
    return false;
  }
  // biome-ignore lint/complexity/useLiteralKeys: Access via index signature satisfies TS4111
  const term = process.env['TERM'];
  if (term === 'dumb') {
    return false;
  }
  return true;
};

const ANSI = supportsColor()
  ? {
      reset: '\u001b[0m',
      bold: '\u001b[1m',
      dim: '\u001b[2m',
      underline: '\u001b[4m',
      red: '\u001b[31m',
      green: '\u001b[32m',
      yellow: '\u001b[33m',
      blue: '\u001b[34m',
      cyan: '\u001b[36m',
    }
  : {
      // Fallback: empty strings for terminals without color support
      reset: '',
      bold: '',
      dim: '',
      underline: '',
      red: '',
      green: '',
      yellow: '',
      blue: '',
      cyan: '',
    };

// Exposed for tests to exercise utility branches.
export const __test__ = {
  supportsOsc8,
  supportsColor,
};

/**
 * Semantic color mapping for improved maintainability and theming.
 * Using semantic names makes it easy to adjust color schemes globally.
 */
const SEMANTIC_COLORS = {
  // Status colors
  SUCCESS: ANSI.green,
  FAILURE: ANSI.red,
  WARNING: ANSI.yellow,
  INFO: ANSI.blue,
  NEUTRAL: ANSI.dim,

  // UI element colors
  HEADER: ANSI.cyan,
  EMPHASIS: ANSI.bold,
} as const;

function colorize(text: string, ...codes: readonly string[]): string {
  return `${codes.join('')}${text}${ANSI.reset}`;
}

/* -------------------------------------------------------------------------- */
/* Status rendering (shared between TTY and non-TTY)                         */
/* -------------------------------------------------------------------------- */

/**
 * Status display configuration with accessibility in mind.
 * Each status uses both color AND symbol to support color-blind users.
 */
const STATUS_CONFIG = {
  PENDING: {
    symbol: '○',
    label: 'PENDING',
    color: 'gray' as const,
    ansiColor: SEMANTIC_COLORS.NEUTRAL,
  },
  RUNNING: {
    symbol: '◐',
    label: 'RUNNING',
    color: 'blue' as const,
    ansiColor: SEMANTIC_COLORS.INFO,
  },
  PASS: {
    symbol: '✔',
    label: 'PASS',
    color: 'green' as const,
    ansiColor: SEMANTIC_COLORS.SUCCESS,
  },
  FAIL: {
    symbol: '✘',
    label: 'FAIL',
    color: 'red' as const,
    ansiColor: SEMANTIC_COLORS.FAILURE,
  },
  ERROR: {
    symbol: '⚠',
    label: 'ERROR',
    color: 'yellow' as const,
    ansiColor: SEMANTIC_COLORS.WARNING,
  },
  SKIPPED: {
    symbol: '⊝',
    label: 'SKIPPED',
    color: 'yellow' as const,
    ansiColor: SEMANTIC_COLORS.WARNING,
  },
} as const;

function getStatusConfig(
  status: TerminalStatus,
): (typeof STATUS_CONFIG)[keyof typeof STATUS_CONFIG] {
  switch (status) {
    case 'PENDING':
      return STATUS_CONFIG.PENDING;
    case 'RUNNING':
      return STATUS_CONFIG.RUNNING;
    case 'PASS':
      return STATUS_CONFIG.PASS;
    case 'FAIL':
      return STATUS_CONFIG.FAIL;
    case 'ERROR':
      return STATUS_CONFIG.ERROR;
    case 'SKIPPED':
      return STATUS_CONFIG.SKIPPED;
    /* v8 ignore next */
    default:
      return STATUS_CONFIG.PENDING;
  }
}

export const WAITING_HEADER_MESSAGE =
  'WAITING FOR ANOTHER PROCESS TO FINISH; PROCESS WILL RESUME SHORTLY';

const UI_CONSTANTS = {
  /** Column widths for table layout */
  COLUMN_WIDTH: {
    LINTER: 24,
    STATUS: 24,
    LOG: 40,
  },
  /** Dashboard title */
  TITLE: 'POLITICAL SPHERE — CI LINTING',
  /** Column headers */
  HEADERS: {
    LINTER: 'Linter',
    STATUS: 'Status',
    LOG: 'Log',
  },
  WAITING_MESSAGE: WAITING_HEADER_MESSAGE,
} as const;

interface LinterSummary {
  readonly total: number;
  readonly pass: number;
  readonly fail: number;
  readonly error: number;
  readonly skipped: number;
}

function summarizeStates(states: readonly LinterState[]): LinterSummary {
  return {
    total: states.length,
    pass: states.filter((s) => s.status === 'PASS').length,
    fail: states.filter((s) => s.status === 'FAIL').length,
    error: states.filter((s) => s.status === 'ERROR').length,
    skipped: states.filter((s) => s.status === 'SKIPPED').length,
  };
}

/* -------------------------------------------------------------------------- */
/* Components                                                                 */
/* -------------------------------------------------------------------------- */

const Header: React.FC<{ readonly statusMessage?: string }> = ({ statusMessage }) => (
  <Box
    borderStyle="double"
    borderColor="cyan"
    paddingX={2}
    paddingY={1}
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
  >
    <Text bold>{UI_CONSTANTS.TITLE}</Text>
    {(statusMessage?.length ?? 0) > 0 ? <Text>{statusMessage}</Text> : null}
  </Box>
);

const StatusIndicator: React.FC<{ readonly status: TerminalStatus }> = ({ status }) => {
  const config = getStatusConfig(status);

  if (status === 'RUNNING') {
    return (
      <Text color={config.color}>
        <Spinner type="dots" /> {config.label}
      </Text>
    );
  }

  return (
    <Text color={config.color}>
      {config.symbol} {config.label}
    </Text>
  );
};

const LogLink: React.FC<{ readonly path: string; readonly status: TerminalStatus }> = ({
  path,
  status,
}) => {
  if (status === 'PENDING') {
    return <Text dimColor>-</Text>;
  }

  const display = supportsOsc8()
    ? createHyperlink('View Log', pathToFileURL(pathLib.resolve(path)).href)
    : path;

  return <Text>{display}</Text>;
};

const StatusTable: React.FC<{ readonly states: readonly LinterState[] }> = ({ states }) => (
  <Box flexDirection="column" marginY={1}>
    <Box>
      <Box width={UI_CONSTANTS.COLUMN_WIDTH.LINTER}>
        <Text bold underline>
          {UI_CONSTANTS.HEADERS.LINTER}
        </Text>
      </Box>
      <Box width={UI_CONSTANTS.COLUMN_WIDTH.STATUS}>
        <Text bold underline>
          {UI_CONSTANTS.HEADERS.STATUS}
        </Text>
      </Box>
      <Box width={UI_CONSTANTS.COLUMN_WIDTH.LOG}>
        <Text bold underline>
          {UI_CONSTANTS.HEADERS.LOG}
        </Text>
      </Box>
    </Box>

    {states.map((s) => (
      <Box key={s.id} marginTop={1}>
        <Box width={UI_CONSTANTS.COLUMN_WIDTH.LINTER}>
          <Text>{s.name}</Text>
        </Box>
        <Box width={UI_CONSTANTS.COLUMN_WIDTH.STATUS}>
          <StatusIndicator status={s.status} />
        </Box>
        <Box width={UI_CONSTANTS.COLUMN_WIDTH.LOG}>
          <LogLink path={s.logPath} status={s.status} />
        </Box>
      </Box>
    ))}
  </Box>
);

const SummaryFooter: React.FC<{
  readonly states: readonly LinterState[];
  readonly duration: number;
}> = ({ states, duration }) => {
  const summary = useMemo(() => summarizeStates(states), [states]);

  return (
    <Box borderStyle="single" borderColor="gray" padding={1} flexDirection="column">
      <Text bold>Summary</Text>
      <Text>
        Total: {summary.total} |{' '}
        <Text color="green" bold>
          ✔ Pass: {summary.pass}
        </Text>{' '}
        |{' '}
        <Text color="red" bold>
          ✘ Fail: {summary.fail}
        </Text>{' '}
        |{' '}
        <Text color="yellow" bold>
          ⚠ Error: {summary.error}
        </Text>{' '}
        |{' '}
        <Text color="yellow" dimColor>
          ⊝ Skipped: {summary.skipped}
        </Text>
      </Text>
      <Text>Duration: {(duration / 1000).toFixed(2)}s</Text>
    </Box>
  );
};

const WaitingScreen: React.FC<{ readonly message: string }> = ({ message }) => (
  <Box flexDirection="column" padding={1}>
    <Header statusMessage={message} />
  </Box>
);

/* -------------------------------------------------------------------------- */
/* Non-TTY renderer                                                           */
/* -------------------------------------------------------------------------- */

function statusLabel(status: TerminalStatus): string {
  const config = getStatusConfig(status);
  return colorize(`${config.symbol} ${config.label}`, config.ansiColor);
}

function renderStaticDashboard(
  states: readonly LinterState[],
  duration: number,
  stdout: NodeJS.WriteStream,
): void {
  const { LINTER: widthLinter, STATUS: widthStatus, LOG: widthLog } = UI_CONSTANTS.COLUMN_WIDTH;

  const header = colorize(UI_CONSTANTS.TITLE, ANSI.bold, ANSI.cyan);
  const headerRow =
    colorize(UI_CONSTANTS.HEADERS.LINTER.padEnd(widthLinter), ANSI.bold, ANSI.underline) +
    colorize(UI_CONSTANTS.HEADERS.STATUS.padEnd(widthStatus), ANSI.bold, ANSI.underline) +
    colorize(UI_CONSTANTS.HEADERS.LOG.padEnd(widthLog), ANSI.bold, ANSI.underline);

  const lines = [header, '', headerRow];

  for (const state of states) {
    const logDisplay = state.status === 'PENDING' ? colorize('-', ANSI.dim) : state.logPath;
    const row =
      state.name.padEnd(widthLinter) + statusLabel(state.status).padEnd(widthStatus) + logDisplay;
    lines.push(row);
  }

  const summary = summarizeStates(states);

  const passLabel = colorize(`Pass: ${summary.pass}`, ANSI.green);
  const failLabel = colorize(`Fail: ${summary.fail}`, ANSI.red);
  const errorLabel = colorize(`Error: ${summary.error}`, ANSI.yellow);
  const skippedLabel = colorize(`Skipped: ${summary.skipped}`, ANSI.yellow);

  lines.push(
    '',
    colorize('Summary', ANSI.bold),
    `Total: ${summary.total} | ${passLabel} | ${failLabel} | ${errorLabel} | ${skippedLabel}`,
    `Duration: ${(duration / 1000).toFixed(2)}s`,
    '',
  );

  stdout.write(`${lines.join('\n')}\n`);
}

function renderStaticHeader(message: string, stdout: NodeJS.WriteStream): void {
  const header = colorize(UI_CONSTANTS.TITLE, ANSI.bold, ANSI.cyan);
  const lines = [header, message, ''];
  stdout.write(`${lines.join('\n')}\n`);
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

const Dashboard: React.FC<DashboardProps> = ({ linters, logDir, subscribe, onComplete }) => {
  const [states, setStates] = useState<LinterState[]>(
    linters.map((l) => ({
      id: l.id,
      name: l.name,
      status: 'PENDING',
      logPath: `${logDir}/${l.id}.log`,
    })),
  );

  // Use useState lazy initialization for start time (only called once)
  const [startTime] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    subscribe((id, status) => {
      setStates((prev) =>
        prev.map((s) => (s.id === id && s.status !== status ? { ...s, status } : s)),
      );
    });
  }, [subscribe]);

  useEffect(() => {
    if (!done && states.every((s) => ['PASS', 'FAIL', 'ERROR', 'SKIPPED'].includes(s.status))) {
      setDone(true);
      setDuration(Date.now() - startTime);
      onComplete();
    }
  }, [states, done, startTime, onComplete]);

  return (
    <Box flexDirection="column" padding={1}>
      <Header />
      <StatusTable states={states} />
      {done && <SummaryFooter states={states} duration={duration} />}
    </Box>
  );
};

function createStaticRenderer(
  linters: readonly LinterConfig[],
  logDir: string,
  streams: DashboardStreams,
): {
  updateStatus: (this: void, id: string, status: TerminalStatus) => void;
  waitForExit: (this: void) => Promise<void>;
} {
  let states: LinterState[] = linters.map((l) => ({
    id: l.id,
    name: l.name,
    status: 'PENDING',
    logPath: `${logDir}/${l.id}.log`,
  }));
  const startTime = Date.now();
  let rendered = false;

  return {
    updateStatus: (id, status) => {
      states = states.map((s) => (s.id === id ? { ...s, status } : s));
    },
    waitForExit: () => {
      if (!rendered) {
        rendered = true;
        renderStaticDashboard(states, Date.now() - startTime, streams.stdout);
      }
      return Promise.resolve();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export function renderDashboard(
  linters: readonly LinterConfig[],
  logDir: string,
  streams?: { readonly stdout?: NodeJS.WriteStream; readonly stderr?: NodeJS.WriteStream },
): {
  updateStatus: (this: void, id: string, status: TerminalStatus) => void;
  waitForExit: (this: void) => Promise<void>;
} {
  const stdout = streams?.stdout ?? process.stdout;
  const stderr = streams?.stderr ?? process.stderr;

  if (!stdout.isTTY) {
    return createStaticRenderer(linters, logDir, { stdout, stderr });
  }

  let listener: ((id: string, status: TerminalStatus) => void) | undefined;
  const pending: Array<{ readonly id: string; readonly status: TerminalStatus }> = [];
  let resolveExit!: () => void;

  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  const { unmount } = render(
    <Dashboard
      linters={linters}
      logDir={logDir}
      subscribe={(l) => {
        listener = l;
        if (pending.length > 0) {
          for (const event of pending.splice(0)) {
            listener(event.id, event.status);
          }
        }
      }}
      onComplete={resolveExit}
    />,
    {
      stdout,
      stderr,
    },
  );

  return {
    updateStatus: (id, status) => {
      if (listener) {
        listener(id, status);
      } else {
        pending.push({ id, status });
      }
    },
    waitForExit: async () => {
      await exitPromise;
      unmount();
    },
  };
}

export function renderWaitingHeader(
  message: string = UI_CONSTANTS.WAITING_MESSAGE,
  streams?: { readonly stdout?: NodeJS.WriteStream; readonly stderr?: NodeJS.WriteStream },
): { unmount: (this: void) => void } {
  const stdout = streams?.stdout ?? process.stdout;
  const stderr = streams?.stderr ?? process.stderr;

  if (!stdout.isTTY) {
    renderStaticHeader(message, stdout);
    return { unmount: () => {} };
  }

  const { unmount } = render(<WaitingScreen message={message} />, { stdout, stderr });
  return { unmount };
}
