import { getPublicApiUrl } from './env-public';

/** URL absoluta da API (ex.: http://localhost:3502/api). */
export function getApiBaseUrl() {
  return getPublicApiUrl().replace(/\/$/, '');
}

/**
 * Fetch para o backend Nest com cookies httpOnly (sessão JWT).
 * Sempre use isto em chamadas autenticadas a partir do browser.
 */
export function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, credentials: 'include' });
}
