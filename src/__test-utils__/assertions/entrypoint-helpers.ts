import { expect, vi } from 'vitest';

export function findFatalErrorCall(
  errorSpy: ReturnType<typeof vi.fn>,
): Record<string, unknown> | undefined {
  const fatalCall = errorSpy.mock.calls.find((c) => c[0] === '\n❌ Fatal error:');
  return fatalCall ? (fatalCall[1] as Record<string, unknown> | undefined) : undefined;
}

export function expectSanitizedArgv(passedError: Record<string, unknown> | undefined): void {
  const details = (
    passedError as unknown as { details?: { context?: { argv?: unknown } } } | undefined
  )?.details as { context?: { argv?: unknown } } | undefined;
  expect(details).toBeDefined();
  expect(Array.isArray(details?.context?.argv)).toBe(true);
  const argvArr = details?.context?.argv as unknown[];
  const anyRedacted = argvArr.includes('<redacted>');
  expect(anyRedacted || argvArr.length === 0).toBe(true);
}
