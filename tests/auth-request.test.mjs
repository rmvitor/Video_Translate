import test from 'node:test';
import assert from 'node:assert/strict';
import { authRequestError } from '../src/auth-request.mjs';

test('signup distinguishes email rate limits, request limits and SMTP recipient restrictions', () => {
  const email = authRequestError({ code: 'over_email_send_rate_limit', status: 429 });
  assert.match(email, /limite de envio de e-mails/);
  assert.match(email, /over_email_send_rate_limit · HTTP 429/);
  const request = authRequestError({ status: 429 });
  assert.match(request, /limite de solicitações/);
  assert.doesNotMatch(request, /senha|requisitos/);
  assert.match(authRequestError({ code: 'email_address_not_authorized', status: 403 }), /não está autorizado/);
  assert.match(authRequestError({ code: 'signup_disabled', status: 422 }), /cadastros estão temporariamente indisponíveis/);
});

test('valid password composition does not imply approval by the server security policy', () => {
  assert.match(authRequestError({ code: 'weak_password', reasons: ['pwned'], status: 422 }), /vazamentos/);
  assert.match(authRequestError({ code: 'weak_password' }), /requisitos locais/);
  assert.match(authRequestError({ code: 'captcha_failed' }), /verificação de segurança/);
});

test('provider errors are classified without reflecting email addresses, tokens or database details', () => {
  const email = authRequestError({ code: 'unexpected_failure', status: 500, message: 'Error sending confirmation email: private@example.test secret-value' });
  const database = authRequestError({ status: 500, message: 'Database error saving new user: private@example.test secret-value' });
  assert.match(email, /email_delivery_failed/);
  assert.match(database, /registration_service_error/);
  for (const message of [email, database, authRequestError({ code: 'private_secret_value', message: '<script>secret-value</script>' }), authRequestError({ code: '__proto__' })]) assert.doesNotMatch(message, /private@|secret-value|private_secret_value|<script>|__proto__/);
  assert.match(authRequestError({ name: 'AuthRetryableFetchError' }), /Confira a conexão/);
  for (const code of ['email_exists', 'user_already_exists', 'user_not_found']) assert.doesNotMatch(authRequestError({ code }), /email_exists|user_already_exists|user_not_found|já cadastrad/);
});
