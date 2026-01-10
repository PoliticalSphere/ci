/**
 * @packageDocumentation
 * File path and package-related constants used across the CLI.
 *
 * These small constants centralize common literal values so callers do not
 * duplicate strings and tests can assert expected defaults.
 *
 * @remarks
 * Keep this file focused on literal values that are unlikely to change per
 * execution; avoid introducing logic here.
 */
/** Filename for the package manifest used when resolving project metadata. */
export const PKG_FILENAME = 'package.json';

/** Fallback value to use when a package version cannot be determined. */
export const PKG_VERSION_FALLBACK = 'unknown';
