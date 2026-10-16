import { passwordPolicy } from './password-policy.mjs';
const authLinkMessages = {
  missing: 'Esta página foi aberta sem uma sessão de recuperação. Use o botão do e-mail mais recente, com o endereço completo; abrir apenas a página de nova senha não autoriza a alteração.',
  browser: 'Não encontramos neste navegador a verificação do pedido de recuperação ou confirmação. Abra o e-mail no mesmo navegador e perfil em que fez o pedido. Se não for possível, solicite outro link nesse navegador.',
  expired: 'O Supabase informou que o link expirou ou já foi utilizado. Solicite um novo e-mail e use o link mais recente.',
  invalid: 'Não foi possível validar este link. Use o endereço completo do e-mail mais recente ou solicite outro.',
  unavailable: 'Não foi possível concluir a validação com o Supabase. Confira a conexão e tente solicitar um novo e-mail. Essa falha não confirma que o link expirou.',
  limited: 'Muitas tentativas de validação. Aguarde alguns minutos antes de solicitar outro e-mail.',
  session: 'A sessão de alteração de senha não pôde ser validada. Entre novamente ou solicite um novo link de recuperação.',
};
export function savedAuthLinkReason(value) { return Object.hasOwn(authLinkMessages, value) ? value : 'invalid'; }
export function authLinkMessage(reason) { return authLinkMessages[savedAuthLinkReason(reason)]; }
export function authLinkReason(error) {
  const code = error?.code || error?.error_code || error?.details?.code;
  if (code === 'otp_expired' || code === 'flow_state_expired') return 'expired';
  if (code === 'bad_code_verifier' || code === 'pkce_code_verifier_not_found' || error?.name === 'AuthPKCECodeVerifierMissingError') return 'browser';
  if (error?.status === 429 || String(code || '').includes('rate_limit')) return 'limited';
  if (error?.status >= 500 || error?.name === 'AuthRetryableFetchError' || error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'unavailable';
  return 'invalid';
}
export const ACCESS_LEASE_SECONDS = 65;
export function publicAccessConfig(value) {
  if (!value?.url || !value?.publishableKey) return null;
  const url = new URL(value.url);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('URL Supabase inválida.');
  const key = String(value.publishableKey);
  if (key.startsWith('sb_secret_')) throw new Error('Use somente a chave pública publishable/anon.');
  if (!key.startsWith('sb_publishable_')) {
    try { const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (payload.role !== 'anon') throw new Error(); }
    catch { throw new Error('Use somente a chave pública publishable/anon.'); }
  }
  return { url: url.origin, publishableKey: key, passwordPolicy: passwordPolicy(value.passwordPolicy) };
}
export function leaseDeadline(response, now = Date.now()) {
  if (response?.allowed !== true || !response.profile?.id || !['user', 'master'].includes(response.profile.role)) return 0;
  const duration = Number(response.lease_seconds);
  return Number.isFinite(duration) && duration > 0 ? now + Math.min(duration, ACCESS_LEASE_SECONDS) * 1000 : 0;
}
export function accessPayload(action, values = {}) {
  const fields = {
    start: [], heartbeat: [], logout: [], list: ['search', 'offset', 'status'], history: ['user_id', 'offset'],
    update: ['user_id', 'status', 'starts_at', 'expires_at', 'session_minutes', 'display_name', 'contact', 'plan_name', 'billing_status', 'amount_cents', 'next_payment_at', 'notes'], revoke: ['user_id'], remove:['user_id'], invite:['email','display_name','contact'],
  }[action];
  if (!Array.isArray(fields)) throw new Error('Ação de acesso inválida.');
  return Object.fromEntries([['action', action], ...fields.filter(field => values[field] !== undefined).map(field => [field, values[field]])]);
}
