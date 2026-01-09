/**
 * Political Sphere — Execution Cache Layer
 *
 * Role:
 *   Provide in-memory caching for expensive linter operations to improve
 *   performance during repeated executions with unchanged inputs.
 *
 * Responsibilities:
 *   - Cache binary existence checks
 *   - Cache version verification results
 *   - Cache skip decision computations
 *   - Manage cache invalidation based on file changes and time
 *
 * Guarantees:
 *   - Thread-safe in-memory cache
 *   - Configurable TTL (time-to-live) per cache entry type
 *   - Hash-based invalidation for file-dependent caches
 *   - Deterministic cache keys
 */

import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';

/**
 * Cached result with metadata for expiration and validation.
 */
interface CacheEntry<T> {
  readonly value: T;
  readonly timestamp: number;
  readonly hash?: string; // Hash of dependencies (e.g., file contents, git state)
}

/**
 * Binary existence cache entry.
 */
interface BinaryCacheEntry extends CacheEntry<boolean> {
  readonly binary: string;
}

/**
 * Version verification cache entry.
 */
interface VersionCacheEntry extends CacheEntry<{ readonly version: string } | null> {
  readonly linterId: string;
}

/**
 * Skip decision cache entry.
 */
interface SkipCacheEntry extends CacheEntry<{ readonly skip: boolean; readonly reason?: string }> {
  readonly linterId: string;
}

/**
 * Execution cache for linter operations.
 */
export class ExecutionCache {
  private readonly binaries: Map<string, BinaryCacheEntry> = new Map();
  private readonly versions: Map<string, VersionCacheEntry> = new Map();
  private readonly skipDecisions: Map<string, SkipCacheEntry> = new Map();

  private readonly binaryTtlMs: number;
  private readonly versionTtlMs: number;
  private readonly skipDecisionTtlMs: number;

  constructor(options?: {
    readonly binaryTtlMs?: number;
    readonly versionTtlMs?: number;
    readonly skipDecisionTtlMs?: number;
  }) {
    // Default TTLs (in milliseconds)
    this.binaryTtlMs = options?.binaryTtlMs ?? 5 * 60 * 1000; // 5 minutes
    this.versionTtlMs = options?.versionTtlMs ?? 10 * 60 * 1000; // 10 minutes
    this.skipDecisionTtlMs = options?.skipDecisionTtlMs ?? 1 * 60 * 1000; // 1 minute
  }

  /**
   * Compute hash of git state (for change detection).
   */
  private computeGitStateHash(): string {
    try {
      const stat = statSync('.git/index');
      return createHash('sha256').update(stat.mtime.toISOString()).digest('hex');
    } catch {
      // Not a git repository or index doesn't exist
      return createHash('sha256').update(String(Date.now())).digest('hex');
    }
  }

  /**
   * Check if cache entry is expired.
   */
  private isExpired<T extends CacheEntry<unknown>>(entry: T, ttlMs: number): boolean {
    return Date.now() - entry.timestamp > ttlMs;
  }

  /**
   * Check if cache entry's hash is still valid.
   */
  private isHashValid<T extends CacheEntry<unknown>>(entry: T, currentHash: string): boolean {
    const entryHash = entry.hash;
    if (entryHash == null || entryHash.length === 0) {
      return false;
    }
    if (currentHash == null || currentHash.length === 0) {
      return false;
    }
    return entryHash === currentHash;
  }

  /**
   * Get cached binary existence check.
   */
  getBinaryCheck(binary: string): boolean | null {
    const entry = this.binaries.get(binary);
    if (!entry || this.isExpired(entry, this.binaryTtlMs)) {
      return null;
    }
    return entry.value;
  }

  /**
   * Cache binary existence check.
   */
  setBinaryCheck(binary: string, exists: boolean): void {
    this.binaries.set(binary, {
      binary,
      value: exists,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached version verification result.
   */
  getVersionCheck(linterId: string): { readonly version: string } | null {
    const entry = this.versions.get(linterId);
    if (!entry || this.isExpired(entry, this.versionTtlMs)) {
      return null;
    }
    return entry.value;
  }

  /**
   * Cache version verification result.
   */
  setVersionCheck(linterId: string, result: { readonly version: string } | null): void {
    this.versions.set(linterId, {
      linterId,
      value: result,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached skip decision.
   * Invalidates if git state has changed since the decision was cached.
   */
  getSkipDecision(linterId: string): { readonly skip: boolean; readonly reason?: string } | null {
    const entry = this.skipDecisions.get(linterId);
    if (!entry || this.isExpired(entry, this.skipDecisionTtlMs)) {
      return null;
    }

    // Validate git state hasn't changed
    const currentGitHash = this.computeGitStateHash();
    if (!this.isHashValid(entry, currentGitHash)) {
      this.skipDecisions.delete(linterId);
      return null;
    }

    return entry.value;
  }

  /**
   * Cache skip decision.
   */
  setSkipDecision(
    linterId: string,
    decision: { readonly skip: boolean; readonly reason?: string },
  ): void {
    const gitHash = this.computeGitStateHash();
    this.skipDecisions.set(linterId, {
      linterId,
      value: decision,
      timestamp: Date.now(),
      hash: gitHash,
    });
  }

  /**
   * Clear all caches.
   */
  clear(): void {
    this.binaries.clear();
    this.versions.clear();
    this.skipDecisions.clear();
  }

  /**
   * Clear binary checks cache.
   */
  clearBinaries(): void {
    this.binaries.clear();
  }

  /**
   * Clear version checks cache.
   */
  clearVersions(): void {
    this.versions.clear();
  }

  /**
   * Clear skip decisions cache.
   */
  clearSkipDecisions(): void {
    this.skipDecisions.clear();
  }

  /**
   * Get cache statistics for monitoring.
   */
  getStats(): {
    readonly binaries: number;
    readonly versions: number;
    readonly skipDecisions: number;
    readonly totalEntries: number;
  } {
    return {
      binaries: this.binaries.size,
      versions: this.versions.size,
      skipDecisions: this.skipDecisions.size,
      totalEntries: this.binaries.size + this.versions.size + this.skipDecisions.size,
    };
  }
}

/**
 * Global execution cache instance.
 * Can be disabled by setting to null.
 */
let globalCache: ExecutionCache | null = new ExecutionCache();

/**
 * Set the global execution cache instance.
 */
function setGlobalCache(cache: ExecutionCache | null): void {
  globalCache = cache;
}

// Read `globalCache` at module initialization to avoid the TS6133
// "declared but its value is never read" diagnostic when no
// external getter is required. This keeps the variable available
// for future use without exporting an unused symbol.
/* eslint-disable-next-line sonarjs/void-use */
void globalCache;

/**
 * Enable caching with optional custom configuration.
 */
export function enableCaching(options?: {
  readonly binaryTtlMs?: number;
  readonly versionTtlMs?: number;
  readonly skipDecisionTtlMs?: number;
}): ExecutionCache {
  const cache = new ExecutionCache(options);
  setGlobalCache(cache);
  return cache;
}

/**
 * Disable caching globally.
 */
export function disableCaching(): void {
  setGlobalCache(null);
}
