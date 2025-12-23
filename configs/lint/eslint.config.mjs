// =============================================================================
// Political Sphere — ESLint (Flat Config)
// -----------------------------------------------------------------------------
// Purpose:
//   Specialist linting beyond Biome’s scope (TS-aware correctness + policy).
//
// Governance:
//   - Biome owns formatting and general style consistency.
//   - ESLint owns specialist rules and TS-aware linting.
//   - Avoid duplicate responsibilities (e.g., unused imports) unless intentional.
//
// Notes:
//   - This config is CI-grade: violations are errors by default.
// =============================================================================

import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export default [
  // ---------------------------------------------------------------------------
  // Global ignores (keep CI fast and avoid linting build outputs)
  // ---------------------------------------------------------------------------
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/reports/**',
      '**/.turbo/**',
      '**/.nx/**',
    ],
  },

  // ---------------------------------------------------------------------------
  // Base JS recommended rules
  // ---------------------------------------------------------------------------
  js.configs.recommended,

  // ---------------------------------------------------------------------------
  // TypeScript-aware linting (recommended)
  // ---------------------------------------------------------------------------
  ...tseslint.configs.recommended,

  // ---------------------------------------------------------------------------
  // Plugin recommendations (specialist rule sets)
  // ---------------------------------------------------------------------------
  importPlugin.configs.recommended,
  security.configs.recommended,
  sonarjs.configs.recommended,
  unicorn.configs.recommended,

  // ---------------------------------------------------------------------------
  // Project rules (applies to JS + TS)
  // ---------------------------------------------------------------------------
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // Core correctness / consistency
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',

      // Unused variables:
      // - Keep this for ESLint because it provides the argsIgnorePattern control.
      // - If Biome also enforces unused vars/imports, ensure only one tool
      //   is enforced in CI to avoid duplicate noise.
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // TypeScript-specific policy rules (specialist)
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-unused-expressions': [
        'error',
        {
          allowShortCircuit: false,
          allowTernary: false,
          allowTaggedTemplates: false,
        },
      ],

      // Encourage explicitness in platform code
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
    },
  },
];
