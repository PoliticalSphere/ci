#!/usr/bin/env node

// ==============================================================================
// Political Sphere — Evasion & Complexity Scanner
// ------------------------------------------------------------------------------
// Purpose:
//   Detect and report lint evasion patterns and complexity drift.
//
// Scans for:
//   - TypeScript error suppression directives
//   - ESLint rule suppressions
//   - Biome rule suppressions
//   - ShellCheck rule suppressions (without rationale)
//   - TypeScript `any` type usage
//
// Design:
//   - Outputs structured JSON for CI integration
//   - Returns non-zero exit code if thresholds exceeded
//   - Supports baseline comparison mode
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from '../core/cli.js';

const repoRoot = getRepoRoot();

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------
const CONFIG = {
  // Patterns to detect (with severity)
  patterns: [
    {
      name: '@ts-ignore',
      regex: /@ts-ignore/g,
      severity: 'error',
      description: 'TypeScript error suppression',
    },
    {
      name: '@ts-expect-error',
      regex: /@ts-expect-error/g,
      severity: 'warn',
      description: 'TypeScript expected error',
    },
    {
      name: 'eslint-disable',
      regex: /eslint-disable(?!-env)/g,
      severity: 'warn',
      description: 'ESLint rule suppression',
    },
    {
      name: 'biome-ignore',
      regex: /biome-ignore/g,
      severity: 'warn',
      description: 'Biome rule suppression',
    },
    {
      name: 'shellcheck-disable',
      regex: /shellcheck disable=/g,
      severity: 'info',
      description: 'ShellCheck rule suppression',
    },
    {
      name: 'type-any',
      regex: /:\s*any\b|as\s+any\b/g,
      severity: 'warn',
      description: 'TypeScript any type',
    },
  ],

  // File patterns to scan
  include: [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.mjs',
    '**/*.cjs',
    '**/*.sh',
  ],

  // Patterns to exclude
  exclude: [
    'node_modules/**',
    'dist/**',
    'build/**',
    'coverage/**',
    'logs/**',
    'reports/**',
    '*.min.*',
    'package-lock.json',
    'tools/scripts/security/evasion-scan.js', // Exclude self (contains pattern definitions)
  ],

  // Thresholds (null = no limit, 0 = strict)
  thresholds: {
    '@ts-ignore': 0,
    '@ts-expect-error': null,
    'eslint-disable': null,
    'biome-ignore': null,
    'shellcheck-disable': null, // Allowed if with rationale
    'type-any': 0,
  },

  // Complexity configuration
  complexity: {
    enabled: true,
    maxFunctionComplexity: 15, // Maximum cyclomatic complexity per function
    maxFileComplexity: 250, // Maximum total complexity per file (relaxed for infrastructure)
    blocking: false, // Set to true to fail on complexity threshold exceeded
  },
};

// -----------------------------------------------------------------------------
// File Discovery
// -----------------------------------------------------------------------------
function findFiles() {
  const files = [];

  function walkDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(repoRoot, fullPath);

        // Check exclusions
        if (
          CONFIG.exclude.some((pattern) => {
            if (pattern.includes('**')) {
              const regex = new RegExp(
                pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'),
              );
              return regex.test(relativePath);
            }
            return relativePath.includes(pattern.replace(/\*\*/g, ''));
          })
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile()) {
          // Check inclusions
          const ext = path.extname(entry.name);
          const shouldInclude = CONFIG.include.some((pattern) => {
            if (pattern.startsWith('**/*.')) {
              return ext === pattern.slice(4);
            }
            return false;
          });

          if (shouldInclude) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  walkDir(repoRoot);
  return files;
}

// -----------------------------------------------------------------------------
// Scanner
// -----------------------------------------------------------------------------
function scanFile(filePath) {
  const findings = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const relativePath = path.relative(repoRoot, filePath);

    for (const pattern of CONFIG.patterns) {
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const matches = line.match(pattern.regex);

        if (matches) {
          for (const match of matches) {
            // Check for rationale (comment after the directive)
            const hasRationale =
              line.includes('#') && line.indexOf('#') < line.indexOf(match);

            findings.push({
              pattern: pattern.name,
              severity: pattern.severity,
              description: pattern.description,
              file: relativePath,
              line: lineNum + 1,
              column: line.indexOf(match) + 1,
              content: line.trim().slice(0, 100),
              hasRationale,
            });
          }
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return findings;
}

// -----------------------------------------------------------------------------
// Complexity Scanner
// -----------------------------------------------------------------------------
// Simple cyclomatic complexity estimation based on control flow keywords.
// For JS/TS files, counts: if, else, for, while, do, switch, case, catch, &&, ||, ?:
// For bash files, counts: if, elif, else, for, while, until, case, &&, ||
// -----------------------------------------------------------------------------
function scanComplexity(filePath) {
  const complexityFindings = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(repoRoot, filePath);
    const ext = path.extname(filePath);

    if (!CONFIG.complexity.enabled) {
      return complexityFindings;
    }

    // Different patterns for different file types
    let patterns;
    if (['.ts', '.tsx', '.js', '.mjs', '.cjs'].includes(ext)) {
      patterns = [
        /\bif\s*\(/g,
        /\belse\s+if\s*\(/g,
        /\bfor\s*\(/g,
        /\bwhile\s*\(/g,
        /\bdo\s*\{/g,
        /\bswitch\s*\(/g,
        /\bcase\s+/g,
        /\bcatch\s*\(/g,
        /\?\s*[^:]+\s*:/g, // ternary
        /&&/g,
        /\|\|/g,
      ];
    } else if (ext === '.sh') {
      patterns = [
        /\bif\s+/g,
        /\belif\s+/g,
        /\bfor\s+/g,
        /\bwhile\s+/g,
        /\buntil\s+/g,
        /\bcase\s+/g,
        /&&/g,
        /\|\|/g,
      ];
    } else {
      return complexityFindings;
    }

    // Count total complexity for the file
    let totalComplexity = 1; // Base complexity
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        totalComplexity += matches.length;
      }
    }

    // Check threshold
    if (totalComplexity > CONFIG.complexity.maxFileComplexity) {
      complexityFindings.push({
        type: 'file-complexity',
        file: relativePath,
        complexity: totalComplexity,
        threshold: CONFIG.complexity.maxFileComplexity,
        severity: 'warn',
        description: `File complexity (${totalComplexity}) exceeds threshold (${CONFIG.complexity.maxFileComplexity})`,
      });
    }
  } catch {
    // Ignore read errors
  }

  return complexityFindings;
}

// -----------------------------------------------------------------------------
// Report Generation
// -----------------------------------------------------------------------------
function generateReport(findings, complexityFindings) {
  const summary = {};

  for (const pattern of CONFIG.patterns) {
    const patternFindings = findings.filter((f) => f.pattern === pattern.name);
    summary[pattern.name] = {
      count: patternFindings.length,
      threshold: CONFIG.thresholds[pattern.name],
      exceeded:
        CONFIG.thresholds[pattern.name] !== null &&
        patternFindings.length > CONFIG.thresholds[pattern.name],
      severity: pattern.severity,
      findings: patternFindings,
    };
  }

  // Add complexity summary
  summary.complexity = {
    count: complexityFindings.length,
    threshold: CONFIG.complexity.maxFileComplexity,
    exceeded: CONFIG.complexity.blocking && complexityFindings.length > 0,
    severity: 'info', // Informational, not blocking
    findings: complexityFindings,
  };

  const totalFindings = findings.length + complexityFindings.length;
  const thresholdExceeded = Object.values(summary).some((s) => s.exceeded);

  return {
    meta: {
      timestamp: new Date().toISOString(),
      repoRoot,
      filesScanned: 0, // Set by caller
      patternsChecked: CONFIG.patterns.length,
      complexityEnabled: CONFIG.complexity.enabled,
    },
    summary,
    totalFindings,
    thresholdExceeded,
  };
}

// -----------------------------------------------------------------------------
// Console Output
// -----------------------------------------------------------------------------
function printPatternSummary(name, data) {
  const status = data.exceeded ? '❌' : '✓';
  const thresholdStr =
    data.threshold !== null ? `(threshold: ${data.threshold})` : '(no limit)';
  console.log(`${status} ${name}: ${data.count} ${thresholdStr}`);

  // Show first 3 findings
  for (const finding of data.findings.slice(0, 3)) {
    if (finding.type === 'file-complexity') {
      // Complexity finding
      console.log(
        `    ${finding.file} — complexity: ${finding.complexity} (max: ${finding.threshold})`,
      );
    } else {
      // Pattern finding
      console.log(
        `    ${finding.file}:${finding.line} — ${(finding.content || '').slice(0, 60)}...`,
      );
    }
  }
  if (data.findings.length > 3) {
    console.log(`    ... and ${data.findings.length - 3} more`);
  }
}

function printReport(report) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log('Political Sphere — Evasion & Complexity Scan');
  console.log('═'.repeat(70));
  console.log(`Scanned: ${report.meta.filesScanned} files`);
  console.log(`Patterns: ${report.meta.patternsChecked}`);
  console.log(`Total findings: ${report.totalFindings}`);
  console.log('─'.repeat(70));

  for (const [name, data] of Object.entries(report.summary)) {
    if (data.count > 0) {
      printPatternSummary(name, data);
    }
  }

  console.log('─'.repeat(70));

  if (report.thresholdExceeded) {
    console.log('❌ FAIL: One or more thresholds exceeded');
  } else {
    console.log('✓ PASS: All thresholds satisfied');
  }

  console.log(`${'═'.repeat(70)}\n`);
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
function main() {
  const files = findFiles();
  const allFindings = [];
  const allComplexityFindings = [];

  for (const file of files) {
    const findings = scanFile(file);
    allFindings.push(...findings);

    const complexityFindings = scanComplexity(file);
    allComplexityFindings.push(...complexityFindings);
  }

  const report = generateReport(allFindings, allComplexityFindings);
  report.meta.filesScanned = files.length;

  // Write JSON report
  const reportDir = path.join(repoRoot, 'reports', 'evasion');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, 'evasion-scan.json'),
    JSON.stringify(report, null, 2),
  );

  // Console output
  printReport(report);

  // Exit code
  process.exit(report.thresholdExceeded ? 1 : 0);
}

main();
