/**
 * ESLint Configuration - Tier 1: Specialist Validator
 *
 * Role: Semantic & ecosystem-specific correctness ONLY
 * Biome handles all formatting and basic correctness (Tier 0)
 *
 * This config ONLY includes:
 * - TypeScript-aware rules Biome doesn't cover
 * - Node.js-specific rules
 * - Security rules (no-eval, unsafe patterns)
 * - React/Hooks rules for Ink UI
 * - Modern JavaScript patterns (unicorn)
 * - Test best practices (vitest)
 *
 * NO formatting rules. NO stylistic rules. Biome owns those.
 */

import eslint from '@eslint/js';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import nodePlugin from 'eslint-plugin-n';
import promisePlugin from 'eslint-plugin-promise';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import regexpPlugin from 'eslint-plugin-regexp';
import securityPlugin from 'eslint-plugin-security';
import sonarPlugin from 'eslint-plugin-sonarjs';
import unicornPlugin from 'eslint-plugin-unicorn';
import vitestPlugin from 'eslint-plugin-vitest';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'html/**',
      '*.min.js',
      '*.bundle.js',
      'eslint.config.js',
    ],
  },

  // Base recommended rules
  eslint.configs.recommended,

  // TypeScript-aware rules (what Biome can't do yet)
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Node.js rules
  nodePlugin.configs['flat/recommended-module'],

  // Security rules
  securityPlugin.configs.recommended,

  // Modern JavaScript best practices
  {
    plugins: {
      unicorn: unicornPlugin,
    },
    rules: {
      ...unicornPlugin.configs.recommended.rules,
    },
  },

  // Promise handling
  {
    plugins: {
      promise: promisePlugin,
    },
    rules: {
      ...promisePlugin.configs.recommended.rules,
    },
  },

  // Code quality and complexity
  {
    plugins: {
      sonarjs: sonarPlugin,
    },
    rules: {
      ...sonarPlugin.configs.recommended.rules,
    },
  },

  // Regex best practices
  {
    plugins: {
      regexp: regexpPlugin,
    },
    rules: {
      ...regexpPlugin.configs['flat/recommended'].rules,
    },
  },

  // JSDoc validation
  {
    plugins: {
      jsdoc: jsdocPlugin,
    },
    rules: {
      ...jsdocPlugin.configs['flat/recommended-typescript-flavor'].rules,
    },
  },

  // React/Ink rules
  {
    files: ['**/*.tsx', '**/*.jsx'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactPlugin.configs.flat['jsx-runtime'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // Not needed with new JSX transform
      'react/prop-types': 'off', // Using TypeScript for prop types
      'react-hooks/purity': 'warn', // Warn instead of error
      'react-hooks/set-state-in-effect': 'off', // Allow state updates in effects for orchestration
    },
    settings: {
      react: {
        version: '19.2',
      },
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // Main configuration
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },

    rules: {
      // ============================================
      // DISABLED: Formatting & stylistic rules
      // Biome handles all of these (Tier 0)
      // ============================================

      // No formatting rules - Biome owns this
      // No stylistic rules - Biome owns this

      // ============================================
      // TypeScript-aware rules (Biome gaps)
      // ============================================

      // Enforce consistent type assertions
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],

      // Require explicit return types on exported functions
      '@typescript-eslint/explicit-module-boundary-types': 'warn',

      // Prevent floating promises (common async bug)
      '@typescript-eslint/no-floating-promises': 'error',

      // Require await in async functions
      '@typescript-eslint/require-await': 'error',

      // Prevent misused promises in conditionals
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: false,
        },
      ],

      // Strict boolean expressions
      '@typescript-eslint/strict-boolean-expressions': [
        'warn',
        {
          allowString: true,
          allowNumber: false,
          allowNullableObject: true,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
          allowAny: false,
        },
      ],

      // Disable base rule in favor of TypeScript version
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // ============================================
      // Security rules (specialist domain)
      // ============================================

      // These are kept from security plugin
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-possible-timing-attacks': 'warn',

      // ============================================
      // Node.js rules (ecosystem-specific)
      // ============================================

      // Handled by TypeScript - disable Node plugin's version
      'n/no-missing-import': 'off',
      'n/no-missing-require': 'off',

      // Node.js best practices
      'n/no-deprecated-api': 'error',
      'n/no-process-exit': 'warn',
      'n/prefer-promises/fs': 'error',
      'n/prefer-promises/dns': 'error',

      // ============================================
      // Project-specific constraints
      // ============================================

      // Enforce proper error handling
      'no-throw-literal': 'error',

      // No console in production code (warn, not error)
      // Biome also has this, but we keep it as belt-and-suspenders
      'no-console': 'off', // Biome handles this

      // ============================================
      // Unicorn adjustments (opinionated, tune as needed)
      // ============================================

      'unicorn/prevent-abbreviations': 'off', // Allow common abbreviations
      'unicorn/no-null': 'off', // Allow null (TypeScript preference)
      'unicorn/filename-case': 'off', // Let Biome handle this
      'unicorn/prefer-module': 'off', // We already enforce this via package.json type: module
      'unicorn/import-style': 'warn', // Prefer named imports for tree-shaking
      'unicorn/no-negated-condition': 'warn', // Encourage positive conditions
      'unicorn/no-nested-ternary': 'warn', // Encourage readability
      'unicorn/prefer-string-raw': 'warn', // Warn instead of error
      'unicorn/switch-case-braces': 'off', // Not always necessary
      'unicorn/catch-error-name': 'off', // Allow err, error, e, etc.
      'unicorn/prefer-top-level-await': 'off', // Not always appropriate for entry points
      'unicorn/prefer-native-coercion-functions': 'error', // Keep CLI/editor aligned on coercion
      'unicorn/escape-case': 'off', // Allow both \x1b and \x1B
      'unicorn/no-array-sort': 'warn', // Encourage proper comparators
      'unicorn/prefer-spread': 'warn', // Encourage modern patterns
      'unicorn/prefer-single-call': 'warn', // Encourage efficiency
      'unicorn/no-immediate-mutation': 'warn', // Discourage side effects
      'unicorn/prefer-default-parameters': 'warn', // Encourage ES6 patterns
      'unicorn/consistent-existence-index-check': 'off', // Allow < 0 for indexOf
      'unicorn/prefer-ternary': 'off', // Not always clearer
      'unicorn/no-array-for-each': 'off', // forEach is fine for tests
      'unicorn/no-useless-switch-case': 'error', // Enforce clean switch statements
      'unicorn/no-useless-undefined': 'warn', // Avoid redundant undefined

      // ============================================
      // SonarJS adjustments
      // ============================================

      'sonarjs/cognitive-complexity': ['error', 15], // Error at 15 for better maintainability
      'sonarjs/no-duplicate-string': 'off', // Too noisy for tests
      'sonarjs/no-nested-conditional': 'off', // Sometimes nested conditionals are clearer
      'sonarjs/publicly-writable-directories': 'off', // Test files often use /tmp
      'sonarjs/no-os-command-from-path': 'warn', // Warn instead of error for CLI tools
      'sonarjs/no-empty-collection': 'off', // False positives with filtering
      'sonarjs/slow-regex': 'warn', // Warn for potential ReDoS, but allow
      'sonarjs/no-alphabetical-sort': 'off', // Allow simple sort() without locale compare
      'sonarjs/no-nested-functions': 'off', // React components often need nested functions
      'sonarjs/no-nested-assignment': 'warn', // Warn instead of error

      // ============================================
      // Promise adjustments
      // ============================================

      'promise/always-return': 'off', // TypeScript handles this better
      'promise/catch-or-return': 'warn', // Warn instead of error

      // ============================================
      // Regexp adjustments
      // ============================================

      'regexp/no-useless-assertions': 'warn', // Warn instead of error

      // ============================================
      // JSDoc adjustments
      // ============================================

      'jsdoc/require-jsdoc': 'off', // Don't require JSDoc everywhere
      'jsdoc/require-param-description': 'off', // TypeScript types are self-documenting
      'jsdoc/require-returns-description': 'off', // TypeScript types are self-documenting
      'jsdoc/require-returns': 'off', // TypeScript return types are sufficient
      'jsdoc/require-param': 'off', // TypeScript parameter types are sufficient
      'jsdoc/tag-lines': 'off', // Allow flexible tag spacing
      'jsdoc/multiline-blocks': 'off', // Allow flexible block formatting
    },
  },

  // Test file overrides
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts', '**/tests/**/*.ts'],
    plugins: {
      vitest: vitestPlugin,
    },
    rules: {
      ...vitestPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off', // Test mocks often use any
      '@typescript-eslint/no-unsafe-assignment': 'off', // Test mocks often use any
      '@typescript-eslint/no-unsafe-member-access': 'off', // Test mocks often use any
      '@typescript-eslint/no-unsafe-call': 'off', // Test mocks often use any
      '@typescript-eslint/no-unsafe-return': 'off', // Test mocks often use any
      '@typescript-eslint/require-await': 'off', // Tests may have async setup without await
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'unicorn/no-useless-undefined': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'vitest/expect-expect': 'off', // Some tests use custom assertions
    },
  },

  // Config files - disable type-checked rules
  {
    files: ['*.config.js', '*.config.mjs', '*.config.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
      'sonarjs/deprecation': 'off',
    },
  },
];
