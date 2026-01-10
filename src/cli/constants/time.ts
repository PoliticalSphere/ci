/**
 * @packageDocumentation
 * Time-related constants used across the codebase.
 *
 * These constants centralize commonly used time units to avoid magic
 * numbers and make intent clear in timeout calculations and tests.
 *
 * @remarks This module exports raw numeric values only; more complex helpers
 * should live elsewhere to keep inference simple.
 */
/** Number of milliseconds in one second. */
export const MS_PER_SECOND = 1000;

/** Number of milliseconds in one minute. */
export const MINUTE_MS = 60 * MS_PER_SECOND;
