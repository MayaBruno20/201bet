import { getApiBaseUrl } from './api-request';
import { adminApiFetch } from './admin-api-request';
import {
  clearStoredAdminAccessToken,
  getStoredAdminAccessToken,
  setStoredAdminAccessToken,
} from './admin-auth-token';

/**
 * Sessão isolada do painel admin (admin.201-bet.com).
 * Não compartilha cookie nem cache com a sessão do site público.
 */
export const ADMIN_AUTH_USER_KEY = '201bet_admin_auth_user';

export { getStoredAdminAccessToken, setStoredAdminAccessToken };

export type AdminSessionUser = {
  id: string;
  email: string;
  name?: string;
  role: 'ADMIN' | 'OPERATOR' | 'AUDITOR';
  status?: string;
  emailVerified?: boolean;
};

function sessionStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function setStoredAdminUser(user: AdminSessionUser) {
  if (!sessionStorageAvailable()) return;
  window.sessionStorage.setItem(ADMIN_AUTH_USER_KEY, JSON.stringify(user));
}

export function getStoredAdminUser(): AdminSessionUser | null {
  if (!sessionStorageAvailable()) return null;
  const raw = window.sessionStorage.getItem(ADMIN_AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminSessionUser;
  } catch {
    return null;
  }
}

export function clearAdminClientSession() {
  if (!sessionStorageAvailable()) return;
  window.sessionStorage.removeItem(ADMIN_AUTH_USER_KEY);
  clearStoredAdminAccessToken();
}

export async function logoutAdminSession() {
  const base = getApiBaseUrl();
  try {
    await adminApiFetch(`${base}/admin/auth/logout`, { method: 'POST' });
  } catch {
    /* ignore */
  } finally {
    clearAdminClientSession();
  }
}
