/**
 * Test helper: capture and remove error listeners for stdout/stderr
 */

export function captureErrorListeners(): { stdout: Set<unknown>; stderr: Set<unknown> } {
  return {
    stdout: new Set(process.stdout.listeners('error')),
    stderr: new Set(process.stderr.listeners('error')),
  };
}

export function removeNewListeners(before: { stdout: Set<unknown>; stderr: Set<unknown> }): void {
  for (const listener of process.stdout.listeners('error')) {
    if (!before.stdout.has(listener)) {
      process.stdout.off('error', listener as (...args: unknown[]) => void);
    }
  }
  for (const listener of process.stderr.listeners('error')) {
    if (!before.stderr.has(listener)) {
      process.stderr.off('error', listener as (...args: unknown[]) => void);
    }
  }
}
