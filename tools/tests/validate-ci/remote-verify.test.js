#!/usr/bin/env node
import assert from 'node:assert/strict';
import { normalizeActionToRepo, mapStatusToInfo } from '../../../tools/scripts/ci/validate-ci/remote-verify.js';

// Tests for normalizeActionToRepo
assert.equal(normalizeActionToRepo('actions/checkout@v2'), 'actions/checkout');
assert.equal(normalizeActionToRepo('owner/repo@abcdef1234567890abcdef1234567890abcdef12'), 'owner/repo');
assert.equal(normalizeActionToRepo('owner/repo/subpath@abc'), 'owner/repo');
assert.equal(normalizeActionToRepo('invalidaction'), null);
assert.equal(normalizeActionToRepo('owner'), null);

// Tests for mapStatusToInfo
assert.deepEqual(mapStatusToInfo(401), { reason: 'authentication failed', error: 'unauthorized' });
assert.deepEqual(mapStatusToInfo(403), { reason: 'permission/rate limited', error: 'forbidden_or_rate_limited' });
assert.deepEqual(mapStatusToInfo(429), { reason: 'rate limited', error: 'rate_limited' });
assert.deepEqual(mapStatusToInfo(500), { reason: 'unexpected status', error: 'unexpected_status' });

console.log('OK: remote-verify helpers');
process.exit(0);
