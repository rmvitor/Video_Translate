import { passwordPolicy } from './password-policy.mjs';
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
