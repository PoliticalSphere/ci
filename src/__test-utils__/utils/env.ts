/**
 * Environment helpers for tests.
 *
 * Centralizes env mutation + restoration to prevent state leaks.
 */

export type EnvSnapshot = Record<string, string | undefined>;

/**
 * Capture selected environment variables.
 */
export const snapshotEnv = (keys: readonly string[]): EnvSnapshot => {
  const snapshot: EnvSnapshot = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
};

/**
 * Restore environment variables from a snapshot.
 */
export const restoreEnv = (snapshot: EnvSnapshot): void => {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      // Delete variable to truly unset it (assigning `undefined` results in the string "undefined")

      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

/**
 * Temporarily apply environment changes for the duration of a callback.
 */
export const withEnv = async <T>(
  updates: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> => {
  const keys = Object.keys(updates);
  const snapshot = snapshotEnv(keys);

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      // Delete variable to truly unset it (assigning `undefined` results in the string "undefined")

      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    restoreEnv(snapshot);
  }
};
