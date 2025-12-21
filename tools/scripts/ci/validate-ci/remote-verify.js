import { execFileSync } from 'node:child_process';

import { detail } from './console.js';
import { isCI } from './env.js';

const defaultTokenProvider = () => process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

export function createRemoteVerifier({
  verifyRemoteShas = false,
  detailImpl = detail,
  isCIImpl = isCI,
  execFile = execFileSync,
  tokenProvider = defaultTokenProvider,
} = {}) {
  const repoRefCache = new Map();
  const remoteUnreachableLogged = new Set();

  function logRemoteUnreachable(repo, ref) {
    if (remoteUnreachableLogged.has(`${repo}@${ref}`)) return;
    const verb = isCIImpl()
      ? 'remote unreachable; verification failed (CI strict)'
      : 'remote unreachable; verification skipped (local tolerant)';
    // NOTE: never log `url` here; it may contain an access token in CI.
    detailImpl(`Remote lookup unreachable for ${repo}@${ref}: ${verb}`);
    remoteUnreachableLogged.add(`${repo}@${ref}`);
  }

  function fetchRepoRefs(repo) {
    if (repoRefCache.has(repo)) {
      return repoRefCache.get(repo);
    }

    const entry = { refs: new Set(), error: null };
    const token = verifyRemoteShas && isCIImpl() ? tokenProvider() : null;
    const url = token
      ? `https://x-access-token:${token}@github.com/${repo}.git`
      : `https://github.com/${repo}.git`;
    try {
      const rawOut = execFile('git', ['ls-remote', url], {
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
        timeout: 10000,
      });
      const out = String(rawOut || '');
      for (const line of out.split(/\r?\n/)) {
        const sha = line.trim().split(/\s+/)[0];
        if (sha) {
          entry.refs.add(sha);
        }
      }
    } catch {
      entry.error = 'remote_unreachable';
    }

    repoRefCache.set(repo, entry);
    return entry;
  }

  return function validateRemoteAction(action, ref) {
    if (!verifyRemoteShas) {
      return { ok: true, error: 'verification_disabled' };
    }
    if (!action || !ref) {
      return { ok: true, error: 'missing_action_or_ref' };
    }
    if (action.startsWith('./')) {
      return { ok: true, error: 'local_action' };
    }
    if (!/^[a-f0-9]{40}$/.test(ref)) {
      return { ok: true, error: 'not_sha' };
    }

    const parts = action.split('/');
    if (parts.length < 2) {
      return { ok: false, error: 'invalid_action_ref' };
    }
    const repo = `${parts[0]}/${parts[1]}`;

    const entry = fetchRepoRefs(repo);
    if (entry.error === 'remote_unreachable') {
      logRemoteUnreachable(repo, ref);
      return {
        ok: !isCIImpl(),
        error: 'remote_unreachable',
      };
    }

    const ok = entry.refs.has(ref);
    return { ok, error: ok ? null : 'ref_not_found' };
  };
}
