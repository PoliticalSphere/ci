#!/usr/bin/env node

// =============================================================================
// Validate-CI — Remote verification helpers
// -----------------------------------------------------------------------------
// Small deterministic checks for validateRemoteAction.
// =============================================================================

import { createRemoteVerifier } from '../scripts/ci/validate-ci/remote-verify.js';
import { fail, info, section } from './test-utils.js';

section('remote', 'validateRemoteAction behavior');

// 1) Local actions should bypass verification.
const localVerifier = createRemoteVerifier({
  verifyRemoteShas: true,
  detailImpl: () => {},
  isCIImpl: () => false,
  execFile: () => {
    fail('execFile should not be called for local actions');
  },
});
const localResult = localVerifier('./.github/actions/foo', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
if (!localResult.ok || localResult.error !== 'local_action') {
  fail('expected local actions to return local_action result');
}
info('OK: local action bypass');

// 2) Disabled verification always returns ok:true.
const disabledVerifier = createRemoteVerifier({
  verifyRemoteShas: false,
  detailImpl: () => {},
  isCIImpl: () => false,
  execFile: () => {
    fail('execFile should not be called when verification disabled');
  },
});
const disabledResult = disabledVerifier('actions/checkout', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
if (!disabledResult.ok || disabledResult.error !== 'verification_disabled') {
  fail('expected verification_disabled when flag is off');
}
info('OK: disabled verification');

// 3) Remote unreachable in CI is treated as failure.
const unreachableVerifier = createRemoteVerifier({
  verifyRemoteShas: true,
  detailImpl: () => {},
  isCIImpl: () => true,
  execFile: () => {
    throw new Error('network');
  },
});
const unreachableResult = unreachableVerifier(
  'actions/checkout',
  'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
);
if (unreachableResult.ok || unreachableResult.error !== 'remote_unreachable') {
  fail('expected remote_unreachable failure in CI on network error');
}
info('OK: remote unreachable fails under CI');

// 4) Successful lookup returns ok true.
const successVerifier = createRemoteVerifier({
  verifyRemoteShas: true,
  detailImpl: () => {},
  isCIImpl: () => false,
  execFile: () =>
    'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\trefs/heads/main\notherid\trefs/heads/main\n',
});
const successResult = successVerifier(
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
  execFile: () => 'otherhashdeadbeefdeadbeefdeadbeefdeadbeef\trefs/heads/main\n',
});
const missingResult = missingVerifier(
  'actions/checkout',
  'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
);
if (missingResult.ok || missingResult.error !== 'ref_not_found') {
  fail('expected ref_not_found when SHA is absent');
}
info('OK: ref_not_found reported');

section('result', 'validateRemoteAction helpers passed');
process.exit(0);
