/**
 * Camada HTTP do painel admin.
 *
 * Tudo que vai pro backend passa pelo `apiFetch`. Ele:
 *   - Lê NEXT_PUBLIC_API_URL do env (ex.: https://api.201-bet.com/api)
 *   - Anexa Bearer token (espelho em sessionStorage) — cobre o caso de cookie
 *     cross-domain ser bloqueado em alguns browsers/configurações
 *   - Envia credentials: 'include' pra mandar o cookie httpOnly `201bet_admin_access`
 *   - Faz parse de erros do Nest (objeto com `message` ou `message: string[]`)
 */

/** Storage isolado do token admin — NÃO compartilha chave com o site público. */
export const ADMIN_TOKEN_KEY = '201bet_admin_access_token';

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  const fallback = 'http://localhost:3502/api';
  if (!raw) return fallback;
  const base = raw.replace(/\/+$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

export function getStoredAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const t = window.sessionStorage.getItem(ADMIN_TOKEN_KEY)?.trim();
    return t ? t : null;
  } catch { return null; }
}

export function setStoredAdminToken(token: string) {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token.trim()); } catch { /* */ }
}

export function clearStoredAdminToken() {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(ADMIN_TOKEN_KEY); } catch { /* */ }
}

export function parseApiError(payload: unknown, fallback = 'Algo deu errado.'): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const body = payload as { message?: string | string[]; error?: string };
  if (Array.isArray(body.message) && body.message[0]) return body.message.join('; ');
  if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
  return fallback;
}

/**
 * Fetch principal. Aceita path absoluto OU relativo (`/admin/users`).
 * Use sempre este em qualquer chamada autenticada.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiBaseUrl();
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;

  const headers = new Headers(init?.headers ?? undefined);
  const token = getStoredAdminToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init?.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { ...init, headers, credentials: 'include' });
}

/**
 * Helper de conveniência: faz fetch + valida ok + retorna JSON tipado.
 * Lança Error com mensagem amigável se status >= 400.
 */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const text = await res.text();
  let body: unknown = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  if (!res.ok) {
    throw new Error(parseApiError(body, `Erro ${res.status}`));
  }
  return body as T;
}

/** Atalhos pra os métodos comuns. */
export const api = {
  get: <T>(path: string, init?: RequestInit) => apiJson<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: RequestInit) => apiJson<T>(path, {
    ...init, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined,
  }),
  patch: <T>(path: string, body?: unknown, init?: RequestInit) => apiJson<T>(path, {
    ...init, method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined,
  }),
  put: <T>(path: string, body?: unknown, init?: RequestInit) => apiJson<T>(path, {
    ...init, method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined,
  }),
  del: <T>(path: string, init?: RequestInit) => apiJson<T>(path, { ...init, method: 'DELETE' }),
};

/**
 * Upload de arquivo (multipart). Ex: POST /admin/cars/:id/photo.
 * NÃO seta Content-Type — o browser monta o boundary automaticamente.
 */
export async function apiUpload<T>(path: string, file: File, fieldName = 'photo'): Promise<T> {
  const fd = new FormData();
  fd.append(fieldName, file);
  const res = await apiFetch(path, { method: 'POST', body: fd });
  const text = await res.text();
  let body: unknown = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  if (!res.ok) throw new Error(parseApiError(body, `Erro ${res.status}`));
  return body as T;
}
