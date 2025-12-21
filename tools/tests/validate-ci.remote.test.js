#!/usr/bin/env node

// =============================================================================
// Validate-CI — Remote verification helpers
// -----------------------------------------------------------------------------
// Small deterministic checks for validateRemoteAction.
// =============================================================================

import { createRemoteVerifier } from '../scripts/ci/validate-ci/remote-verify.js';
import { fail, info, section } from './test-utils.js';

section('remote', 'validateRemoteAction behavior');

async function main() {
  // 1) Local actions should bypass verification.
  const localVerifier = createRemoteVerifier({
    verifyRemoteShas: true,
    detailImpl: () => {},
    isCIImpl: () => false,
    fetchImpl: () => {
      fail('fetch should not be called for local actions');
    },
  });
  const localResult = await localVerifier(
    './.github/actions/foo',
    'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  );
  if (!localResult.ok || localResult.error !== 'local_action') {
    fail('expected local actions to return local_action result');
  }
  info('OK: local action bypass');

  // 2) Disabled verification always returns ok:true.
  const disabledVerifier = createRemoteVerifier({
    verifyRemoteShas: false,
    detailImpl: () => {},
    isCIImpl: () => false,
    fetchImpl: () => {
      fail('fetch should not be called when verification disabled');
    },
  });
  const disabledResult = await disabledVerifier(
    'actions/checkout',
    'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  );
  if (!disabledResult.ok || disabledResult.error !== 'verification_disabled') {
    fail('expected verification_disabled when flag is off');
  }
  info('OK: disabled verification');

  // 3) Remote unreachable in CI is treated as failure.
  const unreachableVerifier = createRemoteVerifier({
    verifyRemoteShas: true,
    detailImpl: () => {},
    isCIImpl: () => true,
    fetchImpl: () => {
      throw new Error('network');
    },
  });
  const unreachableResult = await unreachableVerifier(
    'actions/checkout',
    'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  );
  if (
    unreachableResult.ok ||
    unreachableResult.error !== 'remote_unreachable'
  ) {
    fail('expected remote_unreachable failure in CI on network error');
  }
  info('OK: remote unreachable fails under CI');

  // 4) Successful lookup returns ok true.
  const successVerifier = createRemoteVerifier({
    verifyRemoteShas: true,
    detailImpl: () => {},
    isCIImpl: () => false,
    fetchImpl: async () => ({ status: 200 }),
  });
  const successResult = await successVerifier(
    'actions/checkout',
    'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  );
  if (!successResult.ok || successResult.error !== null) {
    fail('expected successful lookup to pass with error null');
  }
  info('OK: verified SHA found');

  // 5) Missing SHA should return ref_not_found.
  const missingVerifier = createRemoteVerifier({
    verifyRemoteShas: true,
    detailImpl: () => {},
    isCIImpl: () => false,
    fetchImpl: async () => ({ status: 404 }),
  });
  const missingResult = await missingVerifier(
    'actions/checkout',
    'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  );
  if (missingResult.ok || missingResult.error !== 'ref_not_found') {
    fail('expected ref_not_found when SHA is absent');
  }
  info('OK: ref_not_found reported');

  // 6) @sha forms should still resolve to owner/repo.
  const atVerifier = createRemoteVerifier({
    verifyRemoteShas: true,
    detailImpl: () => {},
    isCIImpl: () => false,
    fetchImpl: async () => ({ status: 200 }),
  });
  const atResult = await atVerifier(
    'actions/checkout@deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  );
  if (!atResult.ok) {
    fail('expected @sha action form to still verify');
  }
  info('OK: @sha action strings normalized');

  const subpathResult = await atVerifier(
    'github/codeql-action/upload-sarif',
    'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  );
  if (!subpathResult.ok) {
    fail('expected subpath actions to verify via repo github/codeql-action');
  }
  info('OK: subpath actions normalized');

  // 7) @sha forms must still pass without being marked invalid_action_ref.
  const atShaResult = await atVerifier(
    'actions/checkout@deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  );
  if (!atShaResult.ok) {
    fail('expected @sha form to pass (should not be invalid_action_ref)');
  }
  info('OK: @sha form not rejected as invalid_action_ref');
}

main()
  .then(() => {
    section('result', 'validateRemoteAction helpers passed');
    process.exit(0);
  })
  .catch((err) => {
    fail(err?.message ?? err);
  });
