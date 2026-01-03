// ==============================================================================
// Political Sphere — Validate-CI Remote SHA Verification
// ------------------------------------------------------------------------------
// Purpose:
//   Verify that action SHAs exist upstream when remote verification is enabled.
//
// Notes:
//   - Opt-out via PS_VALIDATE_CI_VERIFY_REMOTE=0/false.
//   - CI is strict when the GitHub API is unreachable; local runs are tolerant.
//   - Avoids logging tokens or URLs containing tokens.
// ==============================================================================

import { detail } from './console.js';
import { isCI } from './env.js';

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_RATE_LIMIT = 429;
const RATE_LIMIT_RESET_MS = 1000;
const NETWORK_PROBE_TIMEOUT_MS = 5000;

const defaultFetch =
  typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : null;
const defaultTokenProvider = () =>
  process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

export function normalizeActionToRepo(action) {
  const noAt = String(action).split('@')[0];
  const parts = noAt.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0]}/${parts[1]}`;
}

export function mapStatusToInfo(status) {
  // Map problematic statuses to human-readable reason and internal error code.
  switch (status) {
    case HTTP_STATUS_UNAUTHORIZED:
      return { reason: 'authentication failed', error: 'unauthorized' };
    case HTTP_STATUS_FORBIDDEN:
      return {
        reason: 'permission/rate limited',
        error: 'forbidden_or_rate_limited',
      };
    case HTTP_STATUS_RATE_LIMIT:
      return { reason: 'rate limited', error: 'rate_limited' };
    default:
      return { reason: 'unexpected status', error: 'unexpected_status' };
  }
}

const REMOTE_VERIFY_FAILURES = {
  ref_not_found: { reason: 'ref not found', weight: 2 },
  api_unreachable: { reason: 'GitHub API unreachable', weight: 2 },
  api_unreachable_local_skip: {
    reason: 'GitHub API unreachable (local skip)',
    weight: 0,
  },
  unauthorized: { reason: 'unauthorized', weight: 2 },
  forbidden_or_rate_limited: { reason: 'forbidden or rate limited', weight: 2 },
  rate_limited: { reason: 'rate limited', weight: 2 },
  unexpected_status: { reason: 'unexpected status', weight: 2 },
  invalid_action_ref: { reason: 'invalid action reference', weight: 3 },
};

export function classifyRemoteVerifyResult(result) {
  const ok = result?.ok ?? true;
  const error = result?.error || null;
  const isSoftRateLimit = error === 'rate_limited_soft';
  const shouldSkip = error === 'api_unreachable_local_skip';

  if (ok) {
    return {
      ok: true,
      reason: null,
      weight: 0,
      shouldSkip,
      isSoftRateLimit,
    };
  }

  const info = REMOTE_VERIFY_FAILURES[error] || {
    reason: 'remote lookup failed',
    weight: 2,
  };
  return {
    ok: false,
    reason: info.reason,
    weight: info.weight,
    shouldSkip: false,
    isSoftRateLimit: false,
  };
}

function buildCommitHeaders(verifyRemoteShas, isCIImpl, tokenProvider) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'political-sphere-validate-ci',
  };
  const token = verifyRemoteShas && isCIImpl() ? tokenProvider() || '' : '';
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function isRateLimitExhausted(status, remaining) {
  if (remaining === null) return false;
  if (status !== HTTP_STATUS_FORBIDDEN && status !== HTTP_STATUS_RATE_LIMIT)
    return false;
  return Number(remaining) === 0;
}

function formatRateLimitReset(resetHeader) {
  if (!resetHeader) return '';
  const resetEpoch = Number(resetHeader) * RATE_LIMIT_RESET_MS;
  if (!Number.isFinite(resetEpoch)) return '';
  return new Date(resetEpoch).toISOString();
}

function evaluateCommitResponse(response, repo, ref, detailImpl) {
  const status = response.status;
  if (status === HTTP_STATUS_OK) return { ok: true, error: null };
  if (status === HTTP_STATUS_NOT_FOUND)
    return { ok: false, error: 'ref_not_found' };
  return handleCommitStatus(response, repo, ref, detailImpl);
}

function handleCommitStatus(response, repo, ref, detailImpl) {
  const status = response.status;
  const remaining = response.headers.get('x-ratelimit-remaining');
  const reset = response.headers.get('x-ratelimit-reset');
  if (isRateLimitExhausted(status, remaining)) {
    const resetIso = formatRateLimitReset(reset);
    detailImpl(
      `REMOTE_VERIFY: rate limit hit; verification skipped for ${repo}@${ref.slice(0, 8)}… reset=${resetIso || 'unknown'}`,
    );
    return { ok: true, error: 'rate_limited_soft' };
  }
  const info = mapStatusToInfo(status);
  detailImpl(
    `REMOTE_VERIFY: repo=${repo} sha=${ref.slice(0, 8)}… status=${status} (${info.reason})`,
  );
  return { ok: false, error: info.error };
}

export function createRemoteVerifier({
  verifyRemoteShas = false,
  detailImpl = detail,
  isCIImpl = isCI,
  fetchImpl = defaultFetch,
  tokenProvider = defaultTokenProvider,
  allowedHosts = [],
} = {}) {
  if (!fetchImpl) {
    throw new Error('fetch is required for remote SHA verification');
  }
  if (!Array.isArray(allowedHosts) || allowedHosts.length === 0) {
    throw new Error('egress allowlist is required for remote verification');
  }
  const cache = new Map();
  const apiUnreachableLogged = new Set();
  let networkCheckPromise = null;
  let networkUnavailableLogged = false;

  function assertEgressAllowed(url) {
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      throw new Error(`invalid URL for egress check: ${url}`);
    }
    if (!allowedHosts.includes(host)) {
      throw new Error(`egress host not allowlisted: ${host}`);
    }
  }

  function logApiUnreachable(repo, ref) {
    if (apiUnreachableLogged.has(`${repo}@${ref}`)) return;
    const verb = isCIImpl()
      ? 'remote unreachable; verification failed (CI strict)'
      : 'remote unreachable; verification skipped (local tolerant)';
    // NOTE: never log `url` here; it may contain an access token in CI.
    detailImpl(
      `Remote SHA verification: GitHub API unreachable for ${repo}@${ref}: ${verb}`,
    );
    apiUnreachableLogged.add(`${repo}@${ref}`);
  }

  async function checkNetworkAvailable() {
    if (networkCheckPromise) return networkCheckPromise;
    const controller =
      typeof globalThis.AbortController === 'function'
        ? new globalThis.AbortController()
        : null;
    networkCheckPromise = (async () => {
      const timeout = globalThis.setTimeout(
        () => controller?.abort(),
        NETWORK_PROBE_TIMEOUT_MS,
      );
      try {
        assertEgressAllowed('https://api.github.com/');
        await fetchImpl('https://api.github.com/', {
          method: 'GET',
          headers: { 'User-Agent': 'political-sphere-validate-ci' },
          signal: controller?.signal,
        });
        // Any HTTP response means the API is reachable.
        return true;
      } catch {
        if (!networkUnavailableLogged) {
          const msg = isCIImpl()
            ? 'Remote SHA verification: GitHub API unreachable; verification will fail in CI.'
            : 'Remote SHA verification: GitHub API unreachable; skipping remote checks locally.';
          detailImpl(msg);
          networkUnavailableLogged = true;
        }
        return false;
      } finally {
        globalThis.clearTimeout(timeout);
      }
    })();
    return networkCheckPromise;
  }

  async function fetchCommit(repo, ref) {
    const cacheKey = `${repo}@${ref}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const pending = (async () => {
      const headers = buildCommitHeaders(
        verifyRemoteShas,
        isCIImpl,
        tokenProvider,
      );
      const url = `https://api.github.com/repos/${repo}/commits/${ref}`;
      let result;
      try {
        assertEgressAllowed(url);
        const response = await fetchImpl(url, {
          method: 'GET',
          headers,
        });
        result = evaluateCommitResponse(response, repo, ref, detailImpl);
      } catch {
        logApiUnreachable(repo, ref);
        result = { ok: !isCIImpl(), error: 'api_unreachable' };
      }
      cache.set(cacheKey, result);
      return result;
    })();

    cache.set(cacheKey, pending);
    return pending;
  }

  return async function validateRemoteAction(action, ref) {
    if (!verifyRemoteShas) return { ok: true, error: 'verification_disabled' };
    if (!action || !ref) return { ok: true, error: 'missing_action_or_ref' };
    if (action.startsWith('./')) return { ok: true, error: 'local_action' };
    if (!/^[a-f0-9]{40}$/.test(ref)) return { ok: true, error: 'not_sha' };

    const normalizedRepo = normalizeActionToRepo(action);
    if (!normalizedRepo) return { ok: false, error: 'invalid_action_ref' };

    if (!(await checkNetworkAvailable())) {
      if (isCIImpl()) return { ok: false, error: 'api_unreachable' };
      return { ok: true, error: 'api_unreachable_local_skip' };
    }

    return await fetchCommit(normalizedRepo, ref);
  };
}
