#!/usr/bin/env node

// ==============================================================================
// Political Sphere — Totem Compliance Checker
// ------------------------------------------------------------------------------
// Purpose:
//   Verify files match their documented totem patterns from architectural-totems.md
//
// Checks:
//   - Bash scripts have proper headers and set -euo pipefail
//   - Workflows have proper metadata blocks
//   - JS/TS files have proper module headers
//
// Design:
//   - Non-blocking, informational
//   - Outputs summary of compliance
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from '../core/cli.js';

const repoRoot = getRepoRoot();

// -----------------------------------------------------------------------------
// Pattern Definitions
// -----------------------------------------------------------------------------
const PATTERNS = {
  bash: {
    extensions: ['.sh'],
    checks: [
      {
        name: 'shebang',
        regex: /^#!\/usr\/bin\/env bash/,
        description: 'Must start with #!/usr/bin/env bash',
      },
      {
        name: 'strict-mode',
        regex: /set -euo pipefail/,
        description: 'Must include set -euo pipefail',
      },
      {
        name: 'header-block',
        regex: /# ={50,}/,
        description: 'Should have header block with ===',
      },
    ],
  },
  workflow: {
    paths: ['.github/workflows/'],
    extensions: ['.yml', '.yaml'],
    checks: [
      {
        name: 'header-block',
        regex: /# ={50,}/,
        description: 'Should have header block with ===',
      },
      {
        name: 'metadata-section',
        regex: /# METADATA|# meta:/i,
        description: 'Should have METADATA section',
      },
      {
        name: 'purpose-section',
        regex: /# PURPOSE/i,
        description: 'Should have PURPOSE section',
      },
    ],
  },
  javascript: {
    extensions: ['.js', '.mjs'],
    paths: ['tools/scripts/', 'tools/tests/'],
    checks: [
      {
        name: 'header-block',
        regex: /\/\/ ={50,}/,
        description: 'Should have header block with ===',
      },
      {
        name: 'purpose-comment',
        regex: /\/\/ Purpose:|\/\/ purpose:/i,
        description: 'Should have Purpose comment',
      },
    ],
  },
};

// -----------------------------------------------------------------------------
// Scanner
// -----------------------------------------------------------------------------
function findFiles(pattern) {
  const files = [];
  const extensions = pattern.extensions || [];
  const paths = pattern.paths || [''];

  function walkDir(dir, basePath) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(repoRoot, fullPath);

        // Skip common excludes
        if (
          relativePath.includes('node_modules') ||
          relativePath.includes('logs/') ||
          relativePath.includes('reports/')
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          walkDir(fullPath, basePath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            // Check if file is in one of the specified paths
            if (paths.some((p) => relativePath.startsWith(p) || p === '')) {
              files.push(fullPath);
            }
          }
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  for (const basePath of paths) {
    const startDir = path.join(repoRoot, basePath);
    if (fs.existsSync(startDir)) {
      walkDir(startDir, basePath);
    }
  }

  return files;
}

function checkFile(filePath, checks) {
  const results = [];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(repoRoot, filePath);

    for (const check of checks) {
      const passed = check.regex.test(content);
      results.push({
        file: relativePath,
        check: check.name,
        passed,
        description: check.description,
      });
    }
  } catch {
    // Ignore read errors
  }
  return results;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
function main() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log('Political Sphere — Totem Compliance Check');
  console.log('═'.repeat(70));

  let totalFiles = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const [type, pattern] of Object.entries(PATTERNS)) {
    const files = findFiles(pattern);
    console.log(`\n${type.toUpperCase()} files: ${files.length}`);
    console.log('─'.repeat(40));

    let typePassCount = 0;
    let typeFailCount = 0;

    for (const file of files) {
      const results = checkFile(file, pattern.checks);
      const allPassed = results.every((r) => r.passed);

      if (allPassed) {
        typePassCount++;
      } else {
        typeFailCount++;
        const failedChecks = results.filter((r) => !r.passed);
        console.log(`  ⚠ ${path.relative(repoRoot, file)}`);
        for (const fc of failedChecks) {
          console.log(`      - ${fc.check}: ${fc.description}`);
        }
      }
    }

    totalFiles += files.length;
    totalPassed += typePassCount;
    totalFailed += typeFailCount;

    if (typeFailCount === 0) {
      console.log(`  ✓ All ${typePassCount} files compliant`);
    } else {
      console.log(
        `\n  Summary: ${typePassCount} passed, ${typeFailCount} need review`,
      );
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(
    `Total: ${totalFiles} files, ${totalPassed} compliant, ${totalFailed} need review`,
  );

  // Informational only - don't fail
  process.exit(0);
}

main();
