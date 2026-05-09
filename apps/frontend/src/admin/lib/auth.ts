/**
 * Camada de autenticação do painel admin.
 *
 * Backend usa cookie httpOnly `201bet_admin_access` + scope=admin no JWT.
 * Aqui mantemos um espelho do JWT em sessionStorage como fallback caso o
 * cookie cross-domain falhe (algumas configurações de browser/Vercel/Render).
 */

import { api, apiFetch, clearStoredAdminToken, parseApiError, setStoredAdminToken } from './api';

export type AdminRole = 'ADMIN' | 'OPERATOR' | 'AUDITOR';

export type AdminUser = {
  userId: string;
  email: string;
  role: AdminRole;
  emailVerified: boolean;
};

const ADMIN_USER_CACHE_KEY = '201bet_admin_user';

/* ─── Cache local do perfil (NÃO é segredo, é só pra evitar re-fetch) ─── */
export function setStoredAdminUser(user: AdminUser) {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(ADMIN_USER_CACHE_KEY, JSON.stringify(user)); } catch { /* */ }
}

export function getStoredAdminUser(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ADMIN_USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch { return null; }
}

export function clearAdminClientSession() {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(ADMIN_USER_CACHE_KEY); } catch { /* */ }
  clearStoredAdminToken();
}

/* ─── Login flow ─── */

export type LoginResult =
  | { kind: 'ok'; user: AdminUser; accessToken?: string }
  | { kind: '2fa-required'; tempToken: string };

/**
 * Etapa 1: e-mail + senha.
 * Se o admin tem 2FA ativado, retorna `{ kind: '2fa-required', tempToken }`.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await apiFetch('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(parseApiError(body, 'Credenciais inválidas'));

  const data = body as
    | { requires2FA: true; tempToken: string }
    | { user: AdminUser; accessToken?: string };

  if ('requires2FA' in data && data.requires2FA) {
    return { kind: '2fa-required', tempToken: data.tempToken };
  }

  const ok = data as { user: AdminUser; accessToken?: string };
  if (ok.accessToken) setStoredAdminToken(ok.accessToken);
  setStoredAdminUser(ok.user);
  return { kind: 'ok', user: ok.user, accessToken: ok.accessToken };
}

/** Etapa 2: aceita TOTP de 6 dígitos OU backup code. */
export async function loginVerify2FA(tempToken: string, code: string): Promise<{ user: AdminUser; accessToken?: string }> {
  const res = await apiFetch('/admin/auth/login/2fa', {
    method: 'POST',
    body: JSON.stringify({ tempToken, code: code.trim() }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(parseApiError(body, 'Código inválido'));

  const data = body as { user: AdminUser; accessToken?: string };
  if (data.accessToken) setStoredAdminToken(data.accessToken);
  setStoredAdminUser(data.user);
  return data;
}

/** Desconecta no servidor (apaga cookie) e limpa cache local. */
export async function logout(): Promise<void> {
  try { await apiFetch('/admin/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  clearAdminClientSession();
}

/** Valida sessão chamando o backend. Use em páginas protegidas. */
export async function fetchMe(): Promise<AdminUser | null> {
  try {
    const me = await api.get<AdminUser>('/admin/auth/me');
    setStoredAdminUser(me);
    return me;
  } catch {
    clearAdminClientSession();
    return null;
  }
}

/* ─── 2FA management ─── */

export type TwoFactorStatus = { enabled: boolean; backupCodesRemaining: number };
export type TwoFactorSetupResponse = { otpauthUrl: string; qrPng: string; secret: string };

export const twoFactor = {
  status: () => api.get<TwoFactorStatus>('/admin/auth/2fa/status'),
  setup: () => api.post<TwoFactorSetupResponse>('/admin/auth/2fa/setup'),
  verify: (code: string) => api.post<{ backupCodes: string[] }>('/admin/auth/2fa/verify', { code }),
  disable: (password: string, code: string) => api.post('/admin/auth/2fa/disable', { password, code }),
  regenerateBackupCodes: (code: string) => api.post<{ backupCodes: string[] }>('/admin/auth/2fa/regenerate-backup-codes', { code }),
};

/* ─── Sessões admin ativas ─── */

export type AdminSessionInfo = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current?: boolean;
  user?: { id: string; email: string; name: string; role: string };
};

export const sessions = {
  listMine: () => api.get<AdminSessionInfo[]>('/admin/auth/sessions/mine'),
  listAll: () => api.get<AdminSessionInfo[]>('/admin/auth/sessions'),
  revoke: (id: string) => api.del(`/admin/auth/sessions/${id}`),
  revokeAll: () => api.post<{ revoked: number }>('/admin/auth/sessions/revoke-all'),
};

/* ─── Políticas de segurança ─── */

export type SecurityPolicies = {
  mfaRequired: boolean;
  sessionTimeoutHours: number;
  passwordMinLength: number;
  maxLoginAttempts: number;
  loginAttemptWindowMin: number;
};

export const policies = {
  get: () => api.get<SecurityPolicies>('/admin/auth/policies'),
  update: (patch: Partial<SecurityPolicies>) => api.patch<SecurityPolicies>('/admin/auth/policies', patch),
};

/* ─── Tentativas de login (sucesso + falha) ─── */

export type LoginAttempt = {
  id: string;
  email: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  scope: string;
  success: boolean;
  reason: string | null;
  createdAt: string;
};

export type LoginAttemptSummary = {
  hours: number;
  failures: number;
  successes: number;
  topIps: Array<{ ip: string | null; attempts: number }>;
};

export const loginAttempts = {
  list: (opts: { hours?: number; onlyFailures?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (opts.hours) params.set('hours', String(opts.hours));
    if (opts.onlyFailures) params.set('onlyFailures', 'true');
    const qs = params.toString();
    return api.get<LoginAttempt[]>(`/admin/auth/login-attempts${qs ? `?${qs}` : ''}`);
  },
  summary: (hours = 24) => api.get<LoginAttemptSummary>(`/admin/auth/login-attempts/summary?hours=${hours}`),
};
