import { getStoredAdminAccessToken } from './admin-auth-token';

/**
 * Fetch dedicado ao painel admin (admin.201-bet.com).
 * Anexa o token espelho `201bet_admin_access_token` (sessionStorage) como Bearer
 * e envia cookies httpOnly (`201bet_admin_access`). Não toca no token do site público.
 */
export function adminApiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const token = getStoredAdminAccessToken();
  const headers = new Headers(init?.headers ?? undefined);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers, credentials: 'include' });
}
