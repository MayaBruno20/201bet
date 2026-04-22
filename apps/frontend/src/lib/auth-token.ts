/** JWT espelho (cross-site quando cookies third-party falham). sessionStorage = tab. */
export const AUTH_ACCESS_TOKEN_KEY = '201bet_access_token';

function sessionStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function setStoredAccessToken(token: string) {
  if (!sessionStorageAvailable()) return;
  const trimmed = token.trim();
  if (!trimmed) return;
  window.sessionStorage.setItem(AUTH_ACCESS_TOKEN_KEY, trimmed);
}

export function getStoredAccessToken(): string | null {
  if (!sessionStorageAvailable()) return null;
  const raw = window.sessionStorage.getItem(AUTH_ACCESS_TOKEN_KEY);
  const t = raw?.trim();
  return t ? t : null;
}

export function clearStoredAccessToken() {
  if (!sessionStorageAvailable()) return;
  window.sessionStorage.removeItem(AUTH_ACCESS_TOKEN_KEY);
}
