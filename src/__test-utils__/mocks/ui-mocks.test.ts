import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertAnsiFallbacks,
  createBoxComponent,
  createInkRender,
  createNonTTYStream,
  createTextComponent,
  createTTYStream,
  findSubscribe,
  loadDashboardComponents,
  loadStatusTable,
  loadUiModule,
  makeLinters,
  setupInkCaptureSubscribeMocks,
  setupInkTestingLibraryMocks,
} from './ui-mocks';

describe('ui mocks', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unmock('ink');
    vi.unmock('ink-spinner');
    vi.unmock('../../cli/output/ui.tsx');
    process.env.NO_COLOR = undefined;
    process.env.TERM = undefined;
  });

  /* ------------------------------------------------------------------ */
  /* findSubscribe                                                       */
  /* ------------------------------------------------------------------ */

  describe('findSubscribe', () => {
    it('returns undefined for non-object inputs', () => {
      expect(findSubscribe(null)).toBeUndefined();
      expect(findSubscribe(undefined)).toBeUndefined();
      expect(findSubscribe('x')).toBeUndefined();
      expect(findSubscribe(1)).toBeUndefined();
    });

    it('returns subscribe directly from props', () => {
      const subscribe = vi.fn();
      expect(findSubscribe({ props: { subscribe } })).toBe(subscribe);
    });

    it('recursively finds subscribe in single child', () => {
      const subscribe = vi.fn();
      expect(findSubscribe({ props: { children: { props: { subscribe } } } })).toBe(subscribe);
    });

    it('recursively finds subscribe in array children', () => {
      const subscribe = vi.fn();
      expect(
        findSubscribe({
          props: { children: [{ props: {} }, { props: { subscribe } }] },
        }),
      ).toBe(subscribe);
    });

    it('returns undefined when recursion finds nothing', () => {
      expect(
        findSubscribe({
          props: { children: [{ props: {} }, { props: {} }] },
        }),
      ).toBeUndefined();
    });
  });

  /* ------------------------------------------------------------------ */
  /* stream helpers                                                      */
  /* ------------------------------------------------------------------ */

  describe('stream helpers', () => {
    it('createTTYStream marks isTTY true', () => {
      const tty = createTTYStream();
      expect(tty.isTTY).toBe(true);
    });

    it('createNonTTYStream marks isTTY false and is writable', () => {
      const nonTty = createNonTTYStream();
      expect(nonTty.isTTY).toBe(false);
      expect(nonTty.write('x')).toBe(true);
    });
  });

  /* ------------------------------------------------------------------ */
  /* ink components                                                      */
  /* ------------------------------------------------------------------ */

  describe('ink component helpers', () => {
    it('createBoxComponent returns children when present', () => {
      expect(createBoxComponent({ children: 'a' })).toBe('a');
      expect(createBoxComponent({ children: 0 })).toBe(0);
      expect(createBoxComponent({ children: '' })).toBe('');
    });

    it('createBoxComponent returns null when children missing', () => {
      expect(createBoxComponent({})).toBeNull();
      expect(createBoxComponent({ children: undefined })).toBeNull();
      expect(createBoxComponent({ children: null })).toBeNull();
    });

    it('createTextComponent mirrors Box semantics', () => {
      expect(createTextComponent({ children: 't' })).toBe('t');
      expect(createTextComponent({})).toBeNull();
    });

    it('createInkRender captures subscribe when found', () => {
      const capture = vi.fn();
      const subscribe = vi.fn();
      const render = createInkRender(findSubscribe, capture);

      const result = render({
        props: { children: { props: { subscribe } } },
      });

      expect(capture).toHaveBeenCalledWith(subscribe);
      expect(result).toEqual({ unmount: expect.any(Function) });
    });

    it('createInkRender returns safe unmount when no subscribe found', () => {
      const render = createInkRender(findSubscribe);
      const result = render({ props: { children: 'x' } });

      expect(result).toEqual({ unmount: expect.any(Function) });
      expect(() => result.unmount()).not.toThrow();
    });

    it('createInkRender handles null input node', () => {
      const render = createInkRender(findSubscribe);
      const result = render(null as unknown as object);

      expect(result).toEqual({ unmount: expect.any(Function) });
    });

    it('createInkRender does nothing when subscribe found but no capture provided', () => {
      const render = createInkRender(findSubscribe);
      const subscribe = vi.fn();

      const result = render({ props: { children: { props: { subscribe } } } });

      // Should return safe unmount and not throw or call any capture
      expect(result).toEqual({ unmount: expect.any(Function) });
      expect(subscribe).not.toHaveBeenCalled();
    });
  });

  /* ------------------------------------------------------------------ */
  /* makeLinters                                                         */
  /* ------------------------------------------------------------------ */

  describe('makeLinters', () => {
    it('maps id/name tuples to linter objects', () => {
      const linters = makeLinters([
        ['x', 'X'],
        ['y', 'Y'],
      ]);

      expect(linters).toEqual([
        {
          id: 'x',
          name: 'X',
          binary: 'bin',
          args: [],
          timeoutMs: 1,
          mode: 'direct',
          risk: 'low',
          enforcement: 'advisory',
          description: 'X linter',
        },
        {
          id: 'y',
          name: 'Y',
          binary: 'bin',
          args: [],
          timeoutMs: 1,
          mode: 'direct',
          risk: 'low',
          enforcement: 'advisory',
          description: 'Y linter',
        },
      ]);
    });

    it('handles empty input', () => {
      expect(makeLinters([])).toEqual([]);
    });
  });

  /* ------------------------------------------------------------------ */
  /* ink mocks                                                           */
  /* ------------------------------------------------------------------ */

  describe('setupInkCaptureSubscribeMocks', () => {
    it('captures subscribe when callback provided', async () => {
      const capture = vi.fn();
      setupInkCaptureSubscribeMocks(capture);

      const ink = await import('ink');
      const inkModule = ink as unknown as { render: (node: unknown) => void };
      const subscribe = vi.fn();

      inkModule.render({
        props: { children: [{ props: { subscribe } }] },
      });

      expect(capture).toHaveBeenCalledWith(subscribe);
    });

    it('does nothing safely when no capture callback provided', async () => {
      setupInkCaptureSubscribeMocks();

      const ink = await import('ink');
      const inkModule = ink as unknown as { render: (node: unknown) => void };
      expect(() => inkModule.render({ props: { children: {} } })).not.toThrow();
    });

    it('ink-spinner mock returns element', async () => {
      setupInkCaptureSubscribeMocks();
      const spinner = (await import('ink-spinner')) as { default: () => unknown };
      expect(spinner.default()).toBeDefined();
    });
  });

  /* ------------------------------------------------------------------ */
  /* setupInkTestingLibraryMocks                                        */
  /* ------------------------------------------------------------------ */

  describe('setupInkTestingLibraryMocks', () => {
    it('mocks ink components and spinner for @testing-library/react', async () => {
      setupInkTestingLibraryMocks();

      const ink = await import('ink');
      const inkModule = ink as unknown as {
        Box: (props: { children?: unknown }) => unknown;
        Text: (props: { children?: unknown }) => unknown;
        render?: (node: unknown) => { unmount: () => void };
      };

      // Box/Text should return React elements (no DOM required)
      const boxEl = inkModule.Box({ children: 'x' } as unknown);
      const textEl = inkModule.Text({ children: 'y' } as unknown);
      expect(boxEl).toBeDefined();
      expect(textEl).toBeDefined();

      const spinner = (await import('ink-spinner')) as { default: () => unknown };
      expect(spinner.default()).toBeDefined();
    });

    it('loadUiModule works with default setupMocks', async () => {
      const mod = await loadUiModule();
      expect(mod).toBeDefined();
    });

    it('loadUiModule works with setupInkCaptureSubscribeMocks', async () => {
      const mod = await loadUiModule(setupInkCaptureSubscribeMocks);
      expect(mod).toBeDefined();
    });
  });

  /* ------------------------------------------------------------------ */
  /* loaders                                                             */
  /* ------------------------------------------------------------------ */

  describe('loaders', () => {
    it('loadStatusTable returns real StatusTable', async () => {
      const StatusTable = await loadStatusTable();
      expect(typeof StatusTable).toBe('function');
    });

    it('loadDashboardComponents returns dashboard exports', async () => {
      const components = await loadDashboardComponents();
      expect(components.WAITING_HEADER_MESSAGE).toBeDefined();
    });
  });

  /* ------------------------------------------------------------------ */
  /* assertAnsiFallbacks — FULL BRANCH COVERAGE                           */
  /* ------------------------------------------------------------------ */

  describe('assertAnsiFallbacks', () => {
    it('runs successfully with real module defaults', async () => {
      await expect(assertAnsiFallbacks()).resolves.toBeUndefined();
    });

    it('early-returns when supportsColor is true', async () => {
      vi.resetModules();
      vi.doMock('../../cli/output/ui.tsx', () => ({
        __esModule: true,
        __test__: { supportsColor: () => true },
        renderWaitingHeader: vi.fn(),
        WAITING_HEADER_MESSAGE: 'WAIT',
      }));

      process.env.TERM = 'xterm';
      process.env.NO_COLOR = undefined;
      await expect(assertAnsiFallbacks()).resolves.toBeUndefined();
    });

    it('handles missing supportsColor export', async () => {
      vi.resetModules();
      vi.doMock('../../cli/output/ui.tsx', () => ({
        __esModule: true,
        __test__: {},
        renderWaitingHeader: vi.fn(() => ({ unmount: () => {} })),
        WAITING_HEADER_MESSAGE: 'WAIT',
      }));

      process.env.NO_COLOR = '1';
      await expect(assertAnsiFallbacks()).resolves.toBeUndefined();
    });

    it('handles missing renderWaitingHeader (fallback object)', async () => {
      vi.resetModules();
      vi.doMock('../../cli/output/ui.tsx', () => ({
        __esModule: true,
        __test__: { supportsColor: () => false },
        renderWaitingHeader: undefined,
        WAITING_HEADER_MESSAGE: 'WAIT',
      }));

      process.env.NO_COLOR = '1';
      await expect(assertAnsiFallbacks()).resolves.toBeUndefined();
    });

    it('handles renderWaitingHeader returning null', async () => {
      vi.resetModules();
      vi.doMock('../../cli/output/ui.tsx', () => ({
        __esModule: true,
        __test__: { supportsColor: () => false },
        WAITING_HEADER_MESSAGE: 'WAIT',
        renderWaitingHeader: () => null,
      }));

      process.env.NO_COLOR = '1';
      await expect(assertAnsiFallbacks()).resolves.toBeUndefined();
    });

    it('uses fallback unmount object when renderWaitingHeader returns undefined', async () => {
      vi.resetModules();
      vi.doMock('../../cli/output/ui.tsx', () => ({
        __esModule: true,
        __test__: { supportsColor: () => false },
        WAITING_HEADER_MESSAGE: 'WAIT',
        renderWaitingHeader: () => undefined,
      }));

      process.env.NO_COLOR = '1';
      await expect(assertAnsiFallbacks()).resolves.toBeUndefined();
    });

    it('uses empty string when WAITING_HEADER_MESSAGE is undefined', async () => {
      vi.resetModules();
      vi.doMock('../../cli/output/ui.tsx', () => ({
        __esModule: true,
        __test__: { supportsColor: () => false },
        WAITING_HEADER_MESSAGE: undefined,
        renderWaitingHeader: vi.fn(() => ({ unmount: () => {} })),
      }));

      process.env.NO_COLOR = '1';
      await expect(assertAnsiFallbacks()).resolves.toBeUndefined();
    });

    it('early returns when supportsColor is falsy (not a function)', async () => {
      vi.resetModules();
      vi.doMock('../../cli/output/ui.tsx', () => ({
        __esModule: true,
        __test__: { supportsColor: null },
        renderWaitingHeader: vi.fn(),
        WAITING_HEADER_MESSAGE: 'WAIT',
      }));

      process.env.NO_COLOR = '1';
      await expect(assertAnsiFallbacks()).resolves.toBeUndefined();
    });

    it('continues assertions when supportsColor returns false', async () => {
      vi.resetModules();
      vi.doMock('../../cli/output/ui.tsx', () => ({
        __esModule: true,
        __test__: { supportsColor: () => false },
        renderWaitingHeader: vi.fn(() => ({ unmount: () => {} })),
        WAITING_HEADER_MESSAGE: 'WAIT',
      }));

      process.env.NO_COLOR = '1';
      await expect(assertAnsiFallbacks()).resolves.toBeUndefined();
    });
  });
});
