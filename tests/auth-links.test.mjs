import test from 'node:test';
import assert from 'node:assert/strict';
import { authLinkMessage, authLinkReason, savedAuthLinkReason } from '../src/access-protocol.mjs';

test('auth callback reasons distinguish browser binding, expiry and service failure', () => {
  for (const error of [{ code: 'otp_expired' }, { details: { code: 'flow_state_expired' } }]) assert.equal(authLinkReason(error), 'expired');
  for (const error of [{ code: 'bad_code_verifier' }, { name: 'AuthPKCECodeVerifierMissingError' }]) assert.equal(authLinkReason(error), 'browser');
  for (const error of [{ status: 503 }, { name: 'AuthRetryableFetchError' }, { name: 'TimeoutError' }]) assert.equal(authLinkReason(error), 'unavailable');
  assert.equal(authLinkReason({ status: 429 }), 'limited');
  assert.equal(authLinkReason({ code: 'flow_state_not_found' }), 'invalid');
  assert.match(authLinkMessage('missing'), /sem uma sessão/);
  assert.doesNotMatch(authLinkMessage('browser'), /expirou/);
});

test('URL reason handling uses a fixed allowlist and never reflects private diagnostics', () => {
  for (const value of ['<script>', '__proto__', 'toString', 'private-token', 'invalido', null, undefined]) {
    assert.equal(savedAuthLinkReason(value), 'invalid');
    assert.equal(authLinkMessage(value), authLinkMessage('invalid'));
  }
  assert.equal(savedAuthLinkReason('browser'), 'browser');
});
