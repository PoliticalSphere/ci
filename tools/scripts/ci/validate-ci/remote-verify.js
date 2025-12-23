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

const defaultFetch =
  typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : null;
const defaultTokenProvider = () =>
  process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

function normalizeActionToRepo(action) {
  const noAt = String(action).split('@')[0];
  const parts = noAt.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0]}/${parts[1]}`;
}

function mapStatusToInfo(status) {
  // Map problematic statuses to human-readable reason and internal error code.
  switch (status) {
    case 401:
      return { reason: 'authentication failed', error: 'unauthorized' };
    case 403:
      return {
        reason: 'permission/rate limited',
        error: 'forbidden_or_rate_limited',
      };
    case 429:
      return { reason: 'rate limited', error: 'rate_limited' };
    default:
      return { reason: 'unexpected status', error: 'unexpected_status' };
  }
}

export function createRemoteVerifier({
  verifyRemoteShas = false,
  detailImpl = detail,
  isCIImpl = isCI,
  fetchImpl = defaultFetch,
  tokenProvider = defaultTokenProvider,
} = {}) {
  if (!fetchImpl) {
    throw new Error('fetch is required for remote SHA verification');
  }
  const cache = new Map();
  const apiUnreachableLogged = new Set();
  let networkChecked = false;
  let networkAvailable = true;
  let networkUnavailableLogged = false;

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
    if (networkChecked) return networkAvailable;
    networkChecked = true;
    const controller =
      typeof globalThis.AbortController === 'function'
        ? new globalThis.AbortController()
        : null;
    const timeout = globalThis.setTimeout(() => controller?.abort(), 5000);
    try {
      await fetchImpl('https://api.github.com/', {
        method: 'GET',
        headers: { 'User-Agent': 'political-sphere-validate-ci' },
        signal: controller?.signal,
      });
      // Any HTTP response means the API is reachable.
      networkAvailable = true;
      return true;
    } catch {
      networkAvailable = false;
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
  }


  async function fetchCommit(repo, ref) {
    const key = `${repo}@${ref}`;
    if (cache.has(key)) {
      return cache.get(key);
    }

    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'political-sphere-validate-ci',
    };
    const token = verifyRemoteShas && isCIImpl() ? tokenProvider() || '' : '';
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const url = `https://api.github.com/repos/${repo}/commits/${ref}`;
    let result;
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers,
      });

      const status = response.status;
      if (status === 200) {
        result = { ok: true, error: null };
      } else if (status === 404) {
        result = { ok: false, error: 'ref_not_found' };
      } else {
        const info = mapStatusToInfo(status);
        detailImpl(
          `REMOTE_VERIFY: repo=${repo} sha=${ref.slice(0, 8)}… status=${status} (${info.reason})`,
        );
        result = { ok: false, error: info.error };
      }
    } catch {
      logApiUnreachable(repo, ref);
      result = { ok: !isCIImpl(), error: 'api_unreachable' };
    }

    cache.set(key, result);
    return result;
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

    return fetchCommit(normalizedRepo, ref);
  };
}
