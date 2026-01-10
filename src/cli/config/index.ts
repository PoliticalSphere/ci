/**
 * Public configuration exports for linter registry data and helpers.
 *
 * @remarks
 * This module exists to centralize exports so other packages import from a
 * single stable path rather than reaching directly into the registry file.
 */

export {
  getAllLinterIds,
  getLinterById,
  LINTER_MAP,
  LINTER_REGISTRY,
  type LinterConfig,
} from './linter-registry.ts';
