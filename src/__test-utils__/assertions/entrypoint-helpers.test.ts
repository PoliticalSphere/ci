import { describe, expect, it, vi } from 'vitest';
import { expectSanitizedArgv, findFatalErrorCall } from './entrypoint-helpers';

describe('entrypoint helpers', () => {
  it('findFatalErrorCall returns the payload from the fatal error call', () => {
    const errorSpy = vi.fn();
    const payload = { details: { context: { argv: ['--token', '<redacted>'] } } };

    errorSpy('\n❌ Fatal error:', payload);

    expect(findFatalErrorCall(errorSpy)).toEqual(payload);
  });

  it('findFatalErrorCall returns undefined when no fatal error call exists', () => {
    const errorSpy = vi.fn();

    errorSpy('not fatal');

    expect(findFatalErrorCall(errorSpy)).toBeUndefined();
  });

  it('expectSanitizedArgv accepts argv values with redacted entries', () => {
    expectSanitizedArgv({ details: { context: { argv: ['--token', '<redacted>'] } } });
    expect(() =>
      expectSanitizedArgv({ details: { context: { argv: ['--token', '<redacted>'] } } }),
    ).not.toThrow();
  });

  it('expectSanitizedArgv accepts empty argv arrays', () => {
    expectSanitizedArgv({ details: { context: { argv: [] } } });
    expect(() => expectSanitizedArgv({ details: { context: { argv: [] } } })).not.toThrow();
  });
});
