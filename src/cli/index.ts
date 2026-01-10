#!/usr/bin/env node
/**
 * Political Sphere — Parallel Linter CLI entry barrel.
 *
 * This module re-exports every public CLI subsystem (core, infrastructure, input,
 * observability, output) so consumers can import from `src/cli/index.ts`. When
 * executed directly it also runs the CLI entrypoint (`runEntrypoint`).
 */

import { pathToFileURL } from 'node:url';

import { runEntrypoint } from './core/index.ts';

export * from './core/index.ts';

/* -------------------------------------------------------------------------- */
/* Module self-execution detection                                            */
/* -------------------------------------------------------------------------- */

const entryUrl = process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;

if (entryUrl !== null && import.meta.url === entryUrl) {
  runEntrypoint();
}
