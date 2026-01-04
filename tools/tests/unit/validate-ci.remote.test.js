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

import { createRemoteVerifier } from '../scripts/workflows/ci/validate-ci/remote-verify.js';
import { fail, info, section } from '../helpers/test-helpers.js';

section('remote', 'createRemoteVerifier — deterministic behavior');

const API_ROOT = 'https://api.github.com/';
const SHA = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

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

function commitUrl(ownerRepo, sha = SHA) {
  return `${API_ROOT}repos/${ownerRepo}/commits/${sha}`;
}

function makeVerifier(
  fetch,
  {
    verifyRemoteShas = true,
    isCI = true,
    allowedHosts = ['api.github.com'],
  } = {},
) {
  return createRemoteVerifier({
    verifyRemoteShas,
    detailImpl: () => {},
    isCIImpl: () => isCI,
    fetchImpl: fetch.fetchImpl,
    allowedHosts,
  });
}

async function runLookupCase({
  label,
  status,
  expectedError,
  expectOk,
  repeat = 1,
  expectedLookupCount = 1,
  verifierAction = 'actions/checkout',
}) {
  const lookupUrl = commitUrl('actions/checkout', SHA);
  const fetch = makeFetchStub({
    statusByUrl: {
      [API_ROOT]: 200,
      [lookupUrl]: status,
    },
  });

  const verifier = makeVerifier(fetch, { isCI: false });
  const results = [];
  for (let i = 0; i < repeat; i++) {
    results.push(await verifier(verifierAction, SHA));
  }

  for (const [index, res] of results.entries()) {
    const runLabel = repeat > 1 ? `${label} call ${index + 1}` : label;
    if (expectOk) {
      assertOk(res, expectedError, runLabel);
    } else {
      assertFail(res, expectedError, runLabel);
    }
  }

  assertEqual(fetch.countUrl(API_ROOT), 1, `${label}: network probe once`);
  assertEqual(
    fetch.countUrl(lookupUrl),
    expectedLookupCount,
    `${label}: commit lookup count`,
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
  };
}

async function main() {
  const sha = SHA;
  // ---------------------------------------------------------------------------
  // 1) Local actions should bypass verification entirely (no network check).
  // ---------------------------------------------------------------------------
  {
    const fetch = makeFetchStub();
    const verifier = makeVerifier(fetch, { isCI: true });

    const res = await verifier('./.github/actions/foo', sha);
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
    const verifier = makeVerifier(fetch, {
      verifyRemoteShas: false,
      isCI: true,
    });

    const res = await verifier('actions/checkout', sha);
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
    const verifier = makeVerifier(fetch, { isCI: true });

    const res1 = await verifier('', sha);
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
    const verifier = makeVerifier(fetch, { isCI: true });

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
      throwByUrl: { [API_ROOT]: 'network down' },
    });

    const verifier = makeVerifier(fetch, { isCI: true });

    const res = await verifier('actions/checkout', sha);
    assertFail(res, 'api_unreachable', 'CI unreachable network probe');
    assertEqual(
      fetch.count(),
      1,
      'CI unreachable: should only do the network probe',
    );
    assertEqual(
      fetch.countUrl(API_ROOT),
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
      throwByUrl: { [API_ROOT]: 'network down' },
    });

    const verifier = makeVerifier(fetch, { isCI: false });

    const res = await verifier('actions/checkout', sha);
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
  await runLookupCase({
    label: 'success lookup',
    status: 200,
    expectedError: null,
    expectOk: true,
  });
  info('OK: verified SHA found (200)');

  // ---------------------------------------------------------------------------
  // 8) Missing SHA: network probe 200, commit lookup 404 => ok:false ref_not_found.
  // ---------------------------------------------------------------------------
  await runLookupCase({
    label: 'missing SHA',
    status: 404,
    expectedError: 'ref_not_found',
    expectOk: false,
  });
  info('OK: missing SHA returns ref_not_found (404)');

  // ---------------------------------------------------------------------------
  // 9) Status mappings: 401, 403, 429, 500 => specific errors.
  // ---------------------------------------------------------------------------
  const mk = async ({ status, expectedError, headers = {} }) => {
    const lookupUrl = commitUrl('actions/checkout', sha);
    const fetch = makeFetchStub({
      statusByUrl: {
        [API_ROOT]: 200,
        [lookupUrl]: status,
      },
      headersByUrl: {
        [lookupUrl]: headers,
      },
    });

    const verifier = makeVerifier(fetch, { isCI: false });

    const res = await verifier('actions/checkout', sha);
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

  // ---------------------------------------------------------------------------
  // 10) Action normalization: `@sha` and subpath actions resolve to owner/repo.
  // ---------------------------------------------------------------------------
  const commitCheckout = commitUrl('actions/checkout', sha);
  const commitCodeql = commitUrl('github/codeql-action', sha);

  const fetch = makeFetchStub({
    statusByUrl: {
      [API_ROOT]: 200,
      [commitCheckout]: 200,
      [commitCodeql]: 200,
    },
  });

  const verifier = makeVerifier(fetch, { isCI: false });

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

  // ---------------------------------------------------------------------------
  // 11) Caching: same repo@sha should only fetch commit lookup once.
  //     (network probe is also cached across calls)
  // ---------------------------------------------------------------------------
  await runLookupCase({
    label: 'cache',
    status: 200,
    expectedError: null,
    expectOk: true,
    repeat: 2,
    expectedLookupCount: 1,
  });

  info('OK: caching prevents duplicate lookups');

  section('result', 'validateRemoteAction helpers passed');
  info('All remote verifier tests passed ✅');
  process.exit(0);
}

try {
  await main();
} catch (err) {
  fail(err?.stack || err?.message || String(err));
}
