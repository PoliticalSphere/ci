/**
 * Tests for the help formatter's escaping and message assembly.
 */

import { describe, expect, it, vi } from 'vitest';

// Import only the token sanitizer statically; import showHelp dynamically
import { escapeHelpToken } from './formatter.ts';

describe('help formatter', () => {
  it('escapeHelpToken removes control chars and emoji', () => {
    expect(escapeHelpToken('ok')).toBe('ok');
    expect(escapeHelpToken('bad\nid')).toBe('badid');
    expect(escapeHelpToken('weird💥')).toBe('weird');
  });

  it('showHelp injects sanitized linter ids', async () => {
    vi.resetModules();

    vi.doMock('../../config/index.ts', () => ({
      getAllLinterIds: () => ['ok', 'bad\nid', 'weird💥'],
    }));

    try {
      const { showHelp } = await import('./formatter.ts');
      const help = showHelp();

      expect(help).toContain('Available: ok, badid, weird');
    } finally {
      vi.doUnmock('../../config/index.ts');
      vi.resetModules();
    }
  });

  it('HELP_MESSAGE template remains immutable across calls', async () => {
    const { showHelp } = await import('./formatter.ts');
    const first = showHelp();
    const second = showHelp();
    expect(first).toBe(second);
  });
});
