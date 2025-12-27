#!/usr/bin/env node

// =============================================================================
// Political Sphere — Validate-CI Remote SHA Verification — Deterministic Tests
// -----------------------------------------------------------------------------
// Purpose:
//   Deterministically test createRemoteVerifier() behavior without real network.
//
// Design goals:
//   - No live HTTP calls
//   - Fully deterministic, self-contained
//   - Covers: bypasses, network gating, commit lookup statuses, normalization,
//     caching, and CI-vs-local strictness
//
// Notes:
//   - We treat "network check" as the first fetch to https://api.github.com/.
//   - We then treat commit lookup as GET /repos/{owner}/{repo}/commits/{sha}.
// =============================================================================

import { createRemoteVerifier } from '../scripts/ci/validate-ci/remote-verify.js';
import { fail, info, section } from './test-utils.js';

section('remote', 'createRemoteVerifier — deterministic behavior');

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(`${message}\nExpected: ${expected}\nActual:   ${actual}`);
  }
}

function assertOk(result, expectedError, label) {
  assert(
    result && typeof result === 'object',
    `${label}: expected result object`,
  );
  assertEqual(result.ok, true, `${label}: expected ok=true`);
  assertEqual(
    result.error,
    expectedError,
    `${label}: expected error=${String(expectedError)}`,
  );
}

function assertFail(result, expectedError, label) {
  assert(
    result && typeof result === 'object',
    `${label}: expected result object`,
  );
  assertEqual(result.ok, false, `${label}: expected ok=false`);
  assertEqual(
    result.error,
    expectedError,
    `${label}: expected error=${String(expectedError)}`,
  );
}

/**
 * A tiny deterministic fetch stub with:
 * - per-URL status mapping
 * - call counting
 * - optional throwing per URL
 */
function makeFetchStub({
  statusByUrl = {},
  headersByUrl = {},
  throwByUrl = {},
  defaultStatus = 200,
} = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const u = String(url);

    if (throwByUrl[u]) {
      throw new Error(throwByUrl[u]);
    }

    const status = Object.hasOwn(statusByUrl, u)
      ? statusByUrl[u]
      : defaultStatus;

    const headerMap = Object.hasOwn(headersByUrl, u) ? headersByUrl[u] : {};
    return {
      status,
      headers: {
        get(name) {
          return headerMap[String(name).toLowerCase()] ?? null;
        },
      },
    };
  };

  return {
    fetchImpl,
    calls,
    count() {
      return calls.length;
    },
    countUrl(url) {
      return calls.filter((c) => c.url === url).length;
    },
    last() {
      return calls[calls.length - 1] || null;
    },
  };
}

async function main() {
  // ---------------------------------------------------------------------------
  // 1) Local actions should bypass verification entirely (no network check).
  // ---------------------------------------------------------------------------
  {
    const fetch = makeFetchStub();
    const verifier = createRemoteVerifier({
      verifyRemoteShas: true,
      detailImpl: () => {},
      isCIImpl: () => true, // doesn't matter; local action bypass should win
      fetchImpl: fetch.fetchImpl,
    });

    const res = await verifier(
      './.github/actions/foo',
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    );
    assertOk(res, 'local_action', 'local action bypass');
    assertEqual(
      fetch.count(),
      0,
      'local action bypass: fetch must not be called',
    );
    info('OK: local actions bypass (no fetch)');
  }

  // ---------------------------------------------------------------------------
  // 2) Disabled verification always ok:true and does not fetch.
  // ---------------------------------------------------------------------------
  {
    const fetch = makeFetchStub();
    const verifier = createRemoteVerifier({
      verifyRemoteShas: false,
      detailImpl: () => {},
      isCIImpl: () => true,
      fetchImpl: fetch.fetchImpl,
    });

    const res = await verifier(
      'actions/checkout',
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    );
    assertOk(res, 'verification_disabled', 'verification disabled');
    assertEqual(
      fetch.count(),
      0,
      'verification disabled: fetch must not be called',
    );
    info('OK: verification disabled short-circuits');
  }

  // ---------------------------------------------------------------------------
  // 3) Missing action/ref returns ok:true and does not fetch.
  // ---------------------------------------------------------------------------
  {
    const fetch = makeFetchStub();
    const verifier = createRemoteVerifier({
      verifyRemoteShas: true,
      detailImpl: () => {},
      isCIImpl: () => true,
      fetchImpl: fetch.fetchImpl,
    });

    const res1 = await verifier('', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    assertOk(res1, 'missing_action_or_ref', 'missing action');
    const res2 = await verifier('actions/checkout', '');
    assertOk(res2, 'missing_action_or_ref', 'missing ref');
    assertEqual(
      fetch.count(),
      0,
      'missing action/ref: fetch must not be called',
    );
    info('OK: missing inputs short-circuit');
  }

  // ---------------------------------------------------------------------------
  // 4) Non-SHA ref returns ok:true and does not fetch.
  // ---------------------------------------------------------------------------
  {
    const fetch = makeFetchStub();
    const verifier = createRemoteVerifier({
      verifyRemoteShas: true,
      detailImpl: () => {},
      isCIImpl: () => true,
      fetchImpl: fetch.fetchImpl,
    });

    const res = await verifier('actions/checkout', 'v4'); // not a 40-char sha
    assertOk(res, 'not_sha', 'non-sha ref');
    assertEqual(fetch.count(), 0, 'non-sha: fetch must not be called');
    info('OK: non-SHA refs bypass remote verification');
  }

  // ---------------------------------------------------------------------------
  // 5) GitHub API unreachable: CI strict => ok:false api_unreachable.
  //    This fails fast during the network probe.
  // ---------------------------------------------------------------------------
  {
    const fetch = makeFetchStub({
      throwByUrl: { 'https://api.github.com/': 'network down' },
    });

    const verifier = createRemoteVerifier({
      verifyRemoteShas: true,
      detailImpl: () => {},
      isCIImpl: () => true,
      fetchImpl: fetch.fetchImpl,
    });

    const res = await verifier(
      'actions/checkout',
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    );
    assertFail(res, 'api_unreachable', 'CI unreachable network probe');
    assertEqual(
      fetch.count(),
      1,
      'CI unreachable: should only do the network probe',
    );
    assertEqual(
      fetch.countUrl('https://api.github.com/'),
      1,
      'CI unreachable: probe URL must be hit exactly once',
    );
    info('OK: CI fails when GitHub API unreachable');
  }

  // ---------------------------------------------------------------------------
  // 6) GitHub API unreachable: local tolerant => ok:true api_unreachable_local_skip.
  // ---------------------------------------------------------------------------
  {
    const fetch = makeFetchStub({
      throwByUrl: { 'https://api.github.com/': 'network down' },
    });

    const verifier = createRemoteVerifier({
      verifyRemoteShas: true,
      detailImpl: () => {},
      isCIImpl: () => false,
      fetchImpl: fetch.fetchImpl,
    });

    const res = await verifier(
      'actions/checkout',
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    );
    assertOk(
      res,
      'api_unreachable_local_skip',
      'local unreachable network probe',
    );
    assertEqual(
      fetch.count(),
      1,
      'local unreachable: should only do the network probe',
    );
    info('OK: local skips when GitHub API unreachable');
  }

  // ---------------------------------------------------------------------------
  // 7) Successful lookup: network probe 200, commit lookup 200 => ok:true error:null.
  // ---------------------------------------------------------------------------
  {
    const commitUrl =
      'https://api.github.com/repos/actions/checkout/commits/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const fetch = makeFetchStub({
      statusByUrl: {
        'https://api.github.com/': 200,
        [commitUrl]: 200,
      },
    });

    const verifier = createRemoteVerifier({
      verifyRemoteShas: true,
      detailImpl: () => {},
      isCIImpl: () => false,
      fetchImpl: fetch.fetchImpl,
    });

    const res = await verifier(
      'actions/checkout',
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    );
    assertOk(res, null, 'success lookup');
    assertEqual(
      fetch.countUrl('https://api.github.com/'),
      1,
      'success: network probe once',
    );
    assertEqual(fetch.countUrl(commitUrl), 1, 'success: commit lookup once');
    info('OK: verified SHA found (200)');
  }

  // ---------------------------------------------------------------------------
  // 8) Missing SHA: network probe 200, commit lookup 404 => ok:false ref_not_found.
  // ---------------------------------------------------------------------------
  {
    const commitUrl =
      'https://api.github.com/repos/actions/checkout/commits/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const fetch = makeFetchStub({
      statusByUrl: {
        'https://api.github.com/': 200,
        [commitUrl]: 404,
      },
    });

    const verifier = createRemoteVerifier({
      verifyRemoteShas: true,
      detailImpl: () => {},
      isCIImpl: () => false,
      fetchImpl: fetch.fetchImpl,
    });

    const res = await verifier(
      'actions/checkout',
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    );
    assertFail(res, 'ref_not_found', 'missing SHA');
    info('OK: missing SHA returns ref_not_found (404)');
  }

  // ---------------------------------------------------------------------------
  // 9) Status mappings: 401, 403, 429, 500 => specific errors.
  // ---------------------------------------------------------------------------
  {
    const mk = async ({ status, expectedError, headers = {} }) => {
      const commitUrl =
        'https://api.github.com/repos/actions/checkout/commits/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const fetch = makeFetchStub({
        statusByUrl: {
          'https://api.github.com/': 200,
          [commitUrl]: status,
        },
        headersByUrl: {
          [commitUrl]: headers,
        },
      });

      const verifier = createRemoteVerifier({
        verifyRemoteShas: true,
        detailImpl: () => {},
        isCIImpl: () => false,
        fetchImpl: fetch.fetchImpl,
      });

      const res = await verifier(
        'actions/checkout',
        'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      );
      assertFail(res, expectedError, `status mapping ${status}`);
    };

    await mk({ status: 401, expectedError: 'unauthorized' });
    await mk({ status: 403, expectedError: 'forbidden_or_rate_limited' });
    await mk({
      status: 429,
      expectedError: 'rate_limited',
      headers: { 'x-ratelimit-remaining': '1' },
    });
    await mk({ status: 500, expectedError: 'unexpected_status' });

    info('OK: status mappings (401/403/429/500)');
  }

  // ---------------------------------------------------------------------------
  // 10) Action normalization: `@sha` and subpath actions resolve to owner/repo.
  // ---------------------------------------------------------------------------
  {
    const sha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

    const commitCheckout = `https://api.github.com/repos/actions/checkout/commits/${sha}`;
    const commitCodeql = `https://api.github.com/repos/github/codeql-action/commits/${sha}`;

    const fetch = makeFetchStub({
      statusByUrl: {
        'https://api.github.com/': 200,
        [commitCheckout]: 200,
        [commitCodeql]: 200,
      },
    });

    const verifier = createRemoteVerifier({
      verifyRemoteShas: true,
      detailImpl: () => {},
      isCIImpl: () => false,
      fetchImpl: fetch.fetchImpl,
    });

    const resAt = await verifier(`actions/checkout@${sha}`, sha);
    assertOk(resAt, null, '@sha action normalization');

    const resSubpath = await verifier('github/codeql-action/upload-sarif', sha);
    assertOk(resSubpath, null, 'subpath action normalization');

    assertEqual(
      fetch.countUrl(commitCheckout),
      1,
      '@sha uses actions/checkout repo',
    );
    assertEqual(
      fetch.countUrl(commitCodeql),
      1,
      'subpath uses github/codeql-action repo',
    );

    info('OK: action normalization (@sha + subpath)');
  }

  // ---------------------------------------------------------------------------
  // 11) Caching: same repo@sha should only fetch commit lookup once.
  //     (network probe is also cached by networkChecked)
  // ---------------------------------------------------------------------------
  {
    const sha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const commitUrl = `https://api.github.com/repos/actions/checkout/commits/${sha}`;

    const fetch = makeFetchStub({
      statusByUrl: {
        'https://api.github.com/': 200,
        [commitUrl]: 200,
      },
    });

    const verifier = createRemoteVerifier({
      verifyRemoteShas: true,
      detailImpl: () => {},
      isCIImpl: () => false,
      fetchImpl: fetch.fetchImpl,
    });

    const r1 = await verifier('actions/checkout', sha);
    const r2 = await verifier('actions/checkout', sha);

    assertOk(r1, null, 'cache first call');
    assertOk(r2, null, 'cache second call');

    assertEqual(
      fetch.countUrl('https://api.github.com/'),
      1,
      'cache: network probe only once',
    );
    assertEqual(fetch.countUrl(commitUrl), 1, 'cache: commit lookup only once');

    info('OK: caching prevents duplicate lookups');
  }

  section('result', 'validateRemoteAction helpers passed');
  info('All remote verifier tests passed ✅');
  process.exit(0);
}

try {
  await main();
} catch (err) {
  fail(err?.stack || err?.message || String(err));
}
