/**
 * Minimal ambient type declarations for `picomatch` used in this repo.
 * This avoids requiring an external `@types` package and only provides the
 * shape needed by `src/cli/incremental.ts`.
 */

declare module 'picomatch' {
  export interface PicomatchOptions {
    dot?: boolean;
    [key: string]: unknown;
  }

  export type MatcherFn = (input: string) => boolean;

  export default function picomatch(
    patterns: string | readonly string[],
    options?: PicomatchOptions,
  ): MatcherFn;
}
