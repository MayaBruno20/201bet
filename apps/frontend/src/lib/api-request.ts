import { getPublicApiUrl } from './env-public';
import { getStoredAccessToken } from './auth-token';

/** URL absoluta da API (ex.: http://localhost:3502/api). */
export function getApiBaseUrl() {
  return getPublicApiUrl().replace(/\/$/, '');
}

/**
 * Fetch para o backend Nest com cookies httpOnly (sessão JWT).
 * Sempre use isto em chamadas autenticadas a partir do browser.
 */
export function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const token = getStoredAccessToken();
  const headers = new Headers(init?.headers ?? undefined);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers, credentials: 'include' });
}
