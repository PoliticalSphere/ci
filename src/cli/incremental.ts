/**
 * Political Sphere — Incremental Execution Support
 *
 * Role:
 *   Provide incremental execution capabilities by tracking file changes
 *   and skipping linters when their target files haven't changed.
 *
 * Responsibilities:
 *   - Detect file changes via git diff
 *   - Track file hashes for change detection
 *   - Compute file patterns relevant to each linter
 *   - Provide incremental execution decisions
 *
 * Guarantees:
 *   - Change detection is git-aware (respects .gitignore)
 *   - File patterns are linter-specific and extensible
 *   - Cache invalidation on meaningful changes only
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import picomatch from 'picomatch';

/**
 * File pattern configuration for detecting changes relevant to a linter.
 */
interface LinterFilePattern {
  readonly linterId: string;
  readonly patterns: readonly string[]; // Glob patterns (e.g., "src/**/*.ts", "*.json")
  readonly ignorePatterns?: readonly string[];
}

/**
 * Change detection result.
 */
interface ChangeDetectionResult {
  readonly hasChanges: boolean;
  readonly changedFiles: readonly string[];
  readonly changeType: 'added' | 'modified' | 'deleted' | 'mixed' | 'none';
}

/**
 * Incremental execution decision.
 */
interface IncrementalExecutionDecision {
  readonly shouldExecute: boolean;
  readonly reason: string;
  readonly lastCheckTime: number;
}

/**
 * Track file changes for incremental linting.
 */
export class IncrementalExecutionTracker {
  private lastChangeCheckTime: Map<string, number> = new Map();
  private lastChangeHash: Map<string, string> = new Map();
  private linterPatterns: Map<string, LinterFilePattern> = new Map();
  private gitAvailable: boolean;

  constructor() {
    this.gitAvailable = this.isGitAvailable();
    this.initializeDefaultPatterns();
  }

  /**
   * Check if git is available in the current directory.
   */
  private isGitAvailable(): boolean {
    try {
      // Use execFileSync with argument array to avoid shell interpolation
      // eslint-disable-next-line sonarjs/no-os-command-from-path
      execFileSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8', stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize default file patterns for common linters.
   */
  private initializeDefaultPatterns(): void {
    const defaults: LinterFilePattern[] = [
      {
        linterId: 'eslint',
        patterns: ['src/**/*.{js,jsx,ts,tsx}', '.eslintrc.js', 'eslint.config.js'],
      },
      {
        linterId: 'typescript',
        patterns: ['src/**/*.ts', 'scripts/**/*.ts', 'tsconfig.json'],
      },
      {
        linterId: 'biome',
        patterns: ['src/**/*.{js,jsx,ts,tsx,json}', 'biome.json'],
      },
      {
        linterId: 'gitleaks',
        patterns: ['src/**/*', '.gitleaks.toml'],
      },
      {
        linterId: 'knip',
        patterns: ['src/**/*', 'knip.json', 'tsconfig.json'],
      },
      {
        linterId: 'markdownlint',
        patterns: ['**/*.md', '.markdownlintrc.json'],
      },
      {
        linterId: 'cspell',
        patterns: ['src/**/*', '**/*.md', 'cspell.json'],
      },
      {
        linterId: 'jscpd',
        patterns: ['src/**/*'],
      },
      {
        linterId: 'semgrep',
        patterns: ['src/**/*'],
      },
      {
        linterId: 'osv-scanner',
        patterns: ['package.json', 'package-lock.json'],
      },
      {
        linterId: 'actionlint',
        patterns: ['.github/workflows/**/*.yaml', '.github/workflows/**/*.yml'],
      },
      {
        linterId: 'yamllint',
        patterns: ['**/*.yaml', '**/*.yml'],
      },
      {
        linterId: 'shellcheck',
        patterns: ['scripts/**/*.sh', '**/*.sh'],
      },
    ];

    for (const pattern of defaults) {
      this.linterPatterns.set(pattern.linterId, pattern);
    }
  }

  /**
   * Register a custom file pattern for a linter.
   */
  registerPattern(pattern: LinterFilePattern): void {
    this.linterPatterns.set(pattern.linterId, pattern);
  }

  /**
   * Get git diff output for specified file patterns.
   */
  private getGitDiff(patterns: readonly string[]): string {
    try {
      if (!this.gitAvailable) {
        return '';
      }

      // Git pathspec is not a general-purpose glob engine (e.g. brace expansion like
      // `**/*.{ts,tsx}` won't behave as expected). Always fetch the changed file list
      // and do glob filtering in-process.
      const args = ['diff', '--name-only', 'HEAD'];
      // eslint-disable-next-line sonarjs/no-os-command-from-path
      const output = execFileSync('git', args, {
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: process.cwd(),
      });

      const changedFiles = output.split('\n').filter((line) => line.trim().length > 0);
      if (patterns.length === 0) {
        return changedFiles.join('\n');
      }

      // Narrow the `picomatch` import to a function-typed value so ESLint
      // (no-unsafe-call / no-unsafe-assignment) can verify the call is safe.
      const picomatchFn = picomatch as unknown as (
        patterns: string | readonly string[],
        options?: { dot?: boolean },
      ) => (input: string) => boolean;
      const match = picomatchFn(patterns as string[], { dot: true });
      // Make the predicate explicitly boolean to satisfy strict-boolean-expressions.
      const filtered = changedFiles.filter((filePath) => match(filePath) === true);
      return filtered.join('\n');
    } catch {
      return '';
    }
  }

  /**
   * Compute a hash of the current git state for the given patterns.
   */
  private computeGitStateHash(patterns: readonly string[]): string {
    try {
      const diff = this.getGitDiff(patterns);
      const status = this.getGitDiff([]); // Get overall status
      const combined = [diff, status].filter(Boolean).join('|');
      return createHash('sha256')
        .update(combined || String(Date.now()))
        .digest('hex');
    } catch {
      // Fall back to a timestamp string when hashing fails (e.g., crypto unavailable)
      return String(Date.now());
    }
  }

  /**
   * Detect if files matching patterns have changed.
   */
  detectChanges(patterns: readonly string[]): ChangeDetectionResult {
    if (!this.gitAvailable) {
      // Without git, assume changes (conservative approach)
      return {
        hasChanges: true,
        changedFiles: [],
        changeType: 'none',
      };
    }

    try {
      const diff = this.getGitDiff(patterns);
      const changedFiles = diff.split('\n').filter((line) => line.trim().length > 0);

      if (changedFiles.length === 0) {
        return {
          hasChanges: false,
          changedFiles: [],
          changeType: 'none',
        };
      }

      // Determine change type (simplified)
      const changeType: 'added' | 'modified' | 'deleted' | 'mixed' = 'mixed';

      return {
        hasChanges: true,
        changedFiles,
        changeType,
      };
    } catch {
      // On error, assume changes
      return {
        hasChanges: true,
        changedFiles: [],
        changeType: 'none',
      };
    }
  }

  /**
   * Get incremental execution decision for a linter.
   */
  getExecutionDecision(
    linterId: string,
    checkInterval: number = 60 * 1000, // 1 minute default
  ): IncrementalExecutionDecision {
    const pattern = this.linterPatterns.get(linterId);
    if (!pattern) {
      return {
        shouldExecute: true,
        reason: 'No pattern registered for linter',
        lastCheckTime: Date.now(),
      };
    }

    const now = Date.now();
    const lastCheck = this.lastChangeCheckTime.get(linterId) ?? 0;

    // If checked recently, use cached decision
    if (now - lastCheck < checkInterval) {
      const cachedHash = this.lastChangeHash.get(linterId);
      const currentHash = this.computeGitStateHash(pattern.patterns);

      if (cachedHash === currentHash) {
        return {
          shouldExecute: false,
          reason: 'No changes detected since last execution',
          lastCheckTime: lastCheck,
        };
      }
    }

    // Perform change detection
    const changes = this.detectChanges(pattern.patterns);
    const currentHash = this.computeGitStateHash(pattern.patterns);

    this.lastChangeCheckTime.set(linterId, now);
    this.lastChangeHash.set(linterId, currentHash);

    if (!changes.hasChanges) {
      return {
        shouldExecute: false,
        reason: 'No relevant files changed',
        lastCheckTime: now,
      };
    }

    return {
      shouldExecute: true,
      reason: `Changes detected in ${changes.changedFiles.length} files`,
      lastCheckTime: now,
    };
  }

  /**
   * Clear all cached change decisions.
   */
  clear(): void {
    this.lastChangeCheckTime.clear();
    this.lastChangeHash.clear();
  }

  /**
   * Clear cache for specific linter.
   */
  clearLinter(linterId: string): void {
    this.lastChangeCheckTime.delete(linterId);
    this.lastChangeHash.delete(linterId);
  }

  /**
   * Get statistics about current tracking state.
   */
  getStats(): {
    readonly gitAvailable: boolean;
    readonly trackedLinters: number;
    readonly registeredPatterns: number;
  } {
    return {
      gitAvailable: this.gitAvailable,
      trackedLinters: this.lastChangeCheckTime.size,
      registeredPatterns: this.linterPatterns.size,
    };
  }
}

/**
 * Global incremental execution tracker instance.
 */
let globalTracker: IncrementalExecutionTracker | null = new IncrementalExecutionTracker();

/**
 * Get the global incremental execution tracker.
 */
export function getGlobalTracker(): IncrementalExecutionTracker | null {
  return globalTracker;
}

/**
 * Set the global incremental execution tracker.
 */
function setGlobalTracker(tracker: IncrementalExecutionTracker | null): void {
  globalTracker = tracker;
}

/**
 * Enable incremental execution tracking.
 */
export function enableIncrementalExecution(): IncrementalExecutionTracker {
  const tracker = new IncrementalExecutionTracker();
  setGlobalTracker(tracker);
  return tracker;
}

/**
 * Disable incremental execution tracking.
 */
export function disableIncrementalExecution(): void {
  setGlobalTracker(null);
}
