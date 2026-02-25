export const AUTH_TOKEN_KEY = '201bet_auth_token';
export const AUTH_USER_KEY = '201bet_auth_user';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN' | 'OPERATOR' | 'AUDITOR';
  status: string;
  avatarUrl?: string | null;
};

export function getAuthToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export function setStoredUser(user: SessionUser) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): SessionUser | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function getAuthRole(): SessionUser['role'] | null {
  const stored = getStoredUser();
  if (stored?.role) {
    return stored.role;
  }

  const token = getAuthToken();
  if (!token) {
    return null;
  }

  const payload = parseJwtPayload(token);
  return typeof payload?.role === 'string' ? (payload.role as SessionUser['role']) : null;
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split('.');
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}
