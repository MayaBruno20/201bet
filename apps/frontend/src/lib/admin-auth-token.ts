/**
 * Token espelho do admin (sessionStorage). Isolado do user token (`201bet_access_token`).
 * Em produção é usado se cookies third-party forem bloqueados; em dev, é o caminho principal.
 */
export const ADMIN_AUTH_ACCESS_TOKEN_KEY = '201bet_admin_access_token';

function sessionStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function setStoredAdminAccessToken(token: string) {
  if (!sessionStorageAvailable()) return;
  const trimmed = token.trim();
  if (!trimmed) return;
  window.sessionStorage.setItem(ADMIN_AUTH_ACCESS_TOKEN_KEY, trimmed);
}

export function getStoredAdminAccessToken(): string | null {
  if (!sessionStorageAvailable()) return null;
  const raw = window.sessionStorage.getItem(ADMIN_AUTH_ACCESS_TOKEN_KEY);
  const t = raw?.trim();
  return t ? t : null;
}

export function clearStoredAdminAccessToken() {
  if (!sessionStorageAvailable()) return;
  window.sessionStorage.removeItem(ADMIN_AUTH_ACCESS_TOKEN_KEY);
}
