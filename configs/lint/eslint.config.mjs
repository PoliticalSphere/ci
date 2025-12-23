// =============================================================================
// Political Sphere — ESLint (Flat Config, TS-correct, CI-grade)
// =============================================================================

import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint"; // ✅ correct flat-config entrypoint

export default [
  // ---------------------------------------------------------------------------
  // Global ignores
  // ---------------------------------------------------------------------------
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/reports/**",
      "**/.turbo/**",
      "**/.nx/**"
    ]
  },

  // ---------------------------------------------------------------------------
  // Base JS recommended
  // ---------------------------------------------------------------------------
  js.configs.recommended,

  // ---------------------------------------------------------------------------
  // TypeScript recommended (flat config)
  // ---------------------------------------------------------------------------
  ...tseslint.configs.recommended,

  // ---------------------------------------------------------------------------
  // Project rules (JS + TS)
  // ---------------------------------------------------------------------------
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        console: "readonly"
      }
    },
    plugins: {
      import: importPlugin,
      security,
      sonarjs,
      unicorn
    },
    rules: {
      // Core correctness / consistency
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",

      // Use only ONE unused-vars rule to avoid duplicate noise:
      // TS rule covers TS+JS in many setups; keep it as the single source of truth.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],

      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": [
        "error",
        {
          allowShortCircuit: false,
          allowTernary: false,
          allowTaggedTemplates: false
        }
      ],

      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" }
      ],

      // Plugin recommendations (enabled explicitly)
      "import/no-unresolved": "off", // often noisy in TS + path aliases; enable later if desired
      "security/detect-object-injection": "off", // very noisy; enable selectively if you want
      "sonarjs/cognitive-complexity": ["error", 15]
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error"
    }
  }
];
