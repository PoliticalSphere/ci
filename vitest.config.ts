import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // -------------------------------------------------------------------------
    // Execution environment
    // -------------------------------------------------------------------------
    environment: 'node',

    // -------------------------------------------------------------------------
    // Test discovery
    // Explicit patterns avoid accidental execution of helper files.
    // -------------------------------------------------------------------------
    include: ['**/*.test.ts', '**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', 'html/**', '**/*.d.ts'],

    // -------------------------------------------------------------------------
    // Coverage (CI-authoritative signal)
    // -------------------------------------------------------------------------
    coverage: {
      provider: 'v8',

      // Human + machine readable outputs
      reporter: ['text', 'json', 'html'],

      // Ensure all source files appear in coverage reports
      include: ['src/**/*.ts', 'scripts/**/*.ts'],

      // Scope coverage to production logic only
      exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        'coverage/**',
        'html/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/*.test.*',
        '**/*.spec.*',
        '**/types.ts',
        '**/__tests__/**',
        '**/fixtures/**',
        '**/test-data/**',
        // Exclude barrel files (re-export only, no executable code)
        '**/__test-utils__/index.ts',
        '**/policy/index.ts',
        '**/modules/index.ts',
        'src/cli/config/index.ts',
        'src/cli/execution/index.ts',
        'src/cli/infrastructure/index.ts',
        'src/cli/input/index.ts',
        'src/cli/input/validation.ts',
        'src/cli/observability/index.ts',
        'src/cli/output/index.ts',
        'src/cli/modules/file-system/file-system.ts',
        'src/index.ts',
      ],

      // Enforce deterministic output location
      reportsDirectory: 'coverage',

      // Prevent regressions by enforcing minimum coverage
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },

      // Do not silently pass when no files are found
      skipFull: false,
    },

    // -------------------------------------------------------------------------
    // Reporting
    // Verbose locally, structured in CI via artifacts.
    // -------------------------------------------------------------------------
    reporters: ['verbose'],

    // -------------------------------------------------------------------------
    // Globals
    // Allowed explicitly to reduce boilerplate.
    // ESLint + TypeScript enforce correctness.
    // -------------------------------------------------------------------------
    globals: true,

    // -------------------------------------------------------------------------
    // Determinism & safety
    // -------------------------------------------------------------------------
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
  },
});
