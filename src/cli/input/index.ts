/**
 * Input handling utilities: argument parsing and validation helpers.
 *
 * This barrel re-exports the CLI argument parser and validation helpers so
 * other layers import from a single stable path.
 */

export { type CLIArgs, parseCliArgs } from './args.ts';
export { ensureSafeDirectoryPath, resolveLinters } from './validation.ts';
