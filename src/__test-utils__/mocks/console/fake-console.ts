/**
 * Lightweight console mock factory for tests.
 */

import type { Mock } from 'vitest';
import { vi } from 'vitest';

/**
 * Create a minimal console shape with spy methods.
 *
 * @returns Spy-based console implementation.
 */
export function fakeConsole(): Readonly<{ log: Mock; error: Mock; warn: Mock; info: Mock }> {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  };
}
