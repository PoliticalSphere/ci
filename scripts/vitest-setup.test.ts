import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('vitest-setup', () => {
  it('creates the coverage temp directory', async () => {
    const tmpDir = path.join(process.cwd(), 'coverage', '.tmp');

    await import('./vitest-setup.ts');

    expect(existsSync(tmpDir)).toBe(true);
  });
});
