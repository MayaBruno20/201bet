import { getApiBaseUrl, apiFetch } from './api-request';
import { clearStoredAccessToken, getStoredAccessToken, setStoredAccessToken } from './auth-token';

/** Cache opcional do perfil (sem segredos). */
export const AUTH_USER_KEY = '201bet_auth_user';

export { getStoredAccessToken, setStoredAccessToken };

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN' | 'OPERATOR' | 'AUDITOR';
  status: string;
  emailVerified: boolean;
  avatarUrl?: string | null;
};

function sessionStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function setStoredUser(user: SessionUser) {
  if (!sessionStorageAvailable()) {
    return;
  }
  window.sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): SessionUser | null {
  if (!sessionStorageAvailable()) {
    return null;
  }
  const raw = window.sessionStorage.getItem(AUTH_USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

/** Remove apenas o cache local do perfil (não apaga o cookie no servidor). */
export function clearClientSession() {
  if (!sessionStorageAvailable()) {
    return;
  }
  window.sessionStorage.removeItem(AUTH_USER_KEY);
  clearStoredAccessToken();
}

/** Encerra sessão no servidor (apaga cookie httpOnly) e limpa o cache local. */
export async function logoutSession() {
  const base = getApiBaseUrl();
  try {
    await apiFetch(`${base}/auth/logout`, { method: 'POST' });
  } catch {
    /* ainda assim limpamos o estado local */
  }
  clearClientSession();
}

export function getAuthRole(): SessionUser['role'] | null {
  return getStoredUser()?.role ?? null;
}

/** Só admin e operador usam o painel /admin; USER, AUDITOR e perfis desconhecidos vão para a área do apostador. */
export function getPostAuthPath(user: { role?: SessionUser['role'] | null }): '/admin' | '/carteira' {
  const r = user.role;
  if (r === 'ADMIN' || r === 'OPERATOR') return '/admin';
  return '/carteira';
}
