import { expect, vi } from 'vitest';
import type { LinterConfig } from '../../cli/config/index.ts';

export const TERM_KEY = 'TERM';
export const TERM_PROGRAM_KEY = 'TERM_PROGRAM';
export const NO_COLOR_KEY = 'NO_COLOR';

export const makeLinter = (id: string, name: string): LinterConfig => ({
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

export const makeLinters = (ids: [string, string][]): ReturnType<typeof makeLinter>[] =>
  ids.map(([id, name]) => makeLinter(id, name));

export const createTTYStream = (): NodeJS.WriteStream =>
  ({ ...process.stdout, isTTY: true }) as unknown as NodeJS.WriteStream;
export const createNonTTYStream = (): NodeJS.WriteStream =>
  ({
    isTTY: false,
    write: (_chunk: string) => {
      // Simple collector function; callers can capture writes by providing a local var
      return true;
    },
  }) as unknown as NodeJS.WriteStream;

/**
 * Recursively search a React-like node tree for a `subscribe` function prop.
 * Exported for direct testing.
 */
export const findSubscribe = (
  value: unknown,
): ((l: (id: string, status: string) => void) => void) | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const element = value as {
    props?: {
      subscribe?: (l: (id: string, status: string) => void) => void;
      children?: unknown;
    };
  };
  if (element.props?.subscribe) {
    return element.props.subscribe;
  }
  const children = element.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findSubscribe(child);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  return children ? findSubscribe(children) : undefined;
};

export const setupInkTestingLibraryMocks = (): void => {
  vi.doMock('ink', async () => {
    const ReactMod = await import('react');
    const { render: rtlRender } = await import('@testing-library/react');
    return {
      __esModule: true,
      Box: ({ children }: { children?: React.ReactNode }) =>
        ReactMod.createElement('div', null, children),
      Text: ({ children }: { children?: React.ReactNode }) =>
        ReactMod.createElement('span', null, children),
      render: (node: React.ReactElement) => {
        const { unmount } = rtlRender(node);
        return { unmount };
      },
    };
  });

  vi.doMock('ink-spinner', async () => {
    const ReactMod = await import('react');
    return {
      __esModule: true,
      default: () => ReactMod.createElement('span', null, 'spinner'),
    };
  });
};

/**
 * Simple passthrough Box implementation for testing.
 * Exported for direct testing coverage.
 */
export const createBoxComponent = ({ children }: { children?: unknown }): unknown =>
  children ?? null;

/**
 * Simple passthrough Text implementation for testing.
 * Exported for direct testing coverage.
 */
export const createTextComponent = ({ children }: { children?: unknown }): unknown =>
  children ?? null;

/**
 * Create an ink render function that captures subscribe callbacks.
 * Exported for direct testing coverage.
 */
export const createInkRender =
  (
    findSub: (value: unknown) => ((l: (id: string, status: string) => void) => void) | undefined,
    captureSubscribe?: (subscribe: (l: (id: string, status: string) => void) => void) => void,
  ) =>
  (node: unknown): { unmount: () => void } => {
    const subscribe = findSub(node);
    if (subscribe && captureSubscribe) {
      captureSubscribe(subscribe);
    }
    return { unmount: () => {} };
  };

export const setupInkCaptureSubscribeMocks = (
  captureSubscribe?: (subscribe: (l: (id: string, status: string) => void) => void) => void,
): void => {
  vi.doMock('ink', () => ({
    __esModule: true,
    Box: createBoxComponent,
    Text: createTextComponent,
    render: createInkRender(findSubscribe, captureSubscribe),
  }));

  vi.doMock('ink-spinner', async () => {
    const ReactMod = await import('react');
    return {
      __esModule: true,
      default: () => ReactMod.createElement('span', null, 'spinner'),
    };
  });
};

export const loadUiModule = async (
  setupMocks: () => void = setupInkTestingLibraryMocks,
): Promise<unknown> => {
  vi.resetModules();
  setupMocks();
  return import('../../cli/output/ui.tsx');
};

type UiTestModule = {
  __test__: {
    StatusTable?: unknown;
    supportsColor?: (() => boolean) | undefined;
    supportsOsc8?: (() => boolean) | undefined;
  };
  renderDashboard?: (
    linters: unknown,
    logDir: string,
    streams?: {
      stdout?: NodeJS.WriteStream | undefined;
      stderr?: NodeJS.WriteStream | undefined;
    },
  ) =>
    | {
        updateStatus: (id: string, status: string) => void;
        waitForExit: () => Promise<void>;
      }
    | undefined;
  renderWaitingHeader?: (
    message: string,
    streams?: {
      stdout?: NodeJS.WriteStream | undefined;
      stderr?: NodeJS.WriteStream | undefined;
    },
  ) => { unmount: () => void } | undefined;
  WAITING_HEADER_MESSAGE?: string | undefined;
  StatusTable?: unknown;
};

export const loadStatusTable = async (): Promise<unknown> => {
  const mod = (await import('../../cli/output/ui.tsx')) as unknown as UiTestModule;
  return mod.__test__.StatusTable;
};

export const loadDashboardComponents = async (): Promise<{
  renderDashboard?: unknown;
  renderWaitingHeader?: unknown;
  WAITING_HEADER_MESSAGE?: string | undefined;
}> => {
  const mod = (await import('../../cli/output/ui.tsx')) as {
    renderDashboard?: unknown;
    renderWaitingHeader?: unknown;
    WAITING_HEADER_MESSAGE?: string | undefined;
  };
  return {
    renderDashboard: mod.renderDashboard,
    renderWaitingHeader: mod.renderWaitingHeader,
    WAITING_HEADER_MESSAGE: mod.WAITING_HEADER_MESSAGE,
  };
};

export const assertAnsiFallbacks = async (): Promise<void> => {
  process.env[NO_COLOR_KEY] = '1';
  delete process.env[TERM_KEY];

  const mod = (await import('../../cli/output/ui.tsx')) as unknown as UiTestModule;
  const { supportsColor } = mod.__test__;

  // Early return if supportsColor is true (ANSI is supported, no fallback needed)
  if (supportsColor?.()) {
    return;
  }

  let _staticOutput = '';
  const stdout = {
    isTTY: false,
    write: (chunk: string) => {
      _staticOutput += chunk;
      return true;
    },
  } as unknown as NodeJS.WriteStream;

  const view = mod.renderWaitingHeader?.(mod.WAITING_HEADER_MESSAGE ?? '', {
    stdout,
    stderr: stdout,
  }) ?? { unmount: () => {} };

  expect(_staticOutput).not.toContain('\u001b[');

  view.unmount();
};
