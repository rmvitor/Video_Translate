// Auth tokens stay in the tab. A short-lived PKCE verifier must cross tabs when an email link opens a new tab.
export function authStorage(session, local, now = Date.now) {
  const verifier = key => key.endsWith('-code-verifier');
  return {
    getItem(key) {
      if (!verifier(key)) return session.getItem(key);
      try { const item = JSON.parse(local.getItem(key) || 'null'); if (typeof item?.value === 'string' && item.expires > now()) return item.value; local.removeItem(key); } catch { local.removeItem(key); }
      return null;
    },
    setItem(key, value) { if (verifier(key)) local.setItem(key, JSON.stringify({ value, expires: now() + 3600000 })); else session.setItem(key, value); },
    removeItem(key) { if (verifier(key)) local.removeItem(key); else session.removeItem(key); },
  };
}
