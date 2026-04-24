import { getPublicApiUrl } from './env-public';
import { getStoredAccessToken } from './auth-token';

/** URL absoluta da API (ex.: http://localhost:3502/api). */
export function getApiBaseUrl() {
  return getPublicApiUrl().replace(/\/$/, '');
}

/**
 * Converte o corpo de erro do Nest (JSON com `message`) em texto amigável.
 * Se não for JSON, devolve o texto (ou o original).
 */
export function parseApiErrorMessage(bodyText: string, fallback = 'Algo deu errado. Tente de novo.'): string {
  const raw = bodyText.trim();
  if (!raw) return fallback;
  if (!raw.startsWith('{') && !raw.startsWith('[')) {
    return raw;
  }
  try {
    const body = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(body.message)) {
      return body.message.join(' ').trim() || fallback;
    }
    if (typeof body.message === 'string' && body.message.trim()) {
      return body.message.trim();
    }
  } catch {
    // não é JSON válido
  }
  return raw;
}

/**
 * Fetch para o backend Nest com cookies httpOnly (sessão JWT).
 * Sempre use isto em chamadas autenticadas a partir do browser.
 */
export function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const token = getStoredAccessToken();
  const headers = new Headers(init?.headers ?? undefined);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (typeof window !== 'undefined') {
    console.log('[apiFetch]', {
      url,
      hasStoredToken: !!token,
      authHeaderPresent: headers.has('Authorization'),
      credentials: init?.credentials ?? 'include',
    });
  }

  return fetch(input, { ...init, headers, credentials: 'include' });
}
