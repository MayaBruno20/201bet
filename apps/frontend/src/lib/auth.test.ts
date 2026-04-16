import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_USER_KEY,
  clearClientSession,
  getAuthRole,
  getStoredUser,
  logoutSession,
  setStoredUser,
  type SessionUser,
} from './auth';

const sampleUser: SessionUser = {
  id: '1',
  email: 'u@test.com',
  name: 'User',
  role: 'USER',
  status: 'ACTIVE',
};

describe('auth (client session cache)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3502/api');
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('setStoredUser and getStoredUser roundtrip', () => {
    setStoredUser(sampleUser);
    expect(getStoredUser()).toEqual(sampleUser);
    expect(sessionStorage.getItem(AUTH_USER_KEY)).toBeTruthy();
  });

  it('getAuthRole reads from stored user', () => {
    setStoredUser(sampleUser);
    expect(getAuthRole()).toBe('USER');
  });

  it('clearClientSession removes user', () => {
    setStoredUser(sampleUser);
    clearClientSession();
    expect(getStoredUser()).toBeNull();
  });

  it('logoutSession calls backend and clears storage', async () => {
    setStoredUser(sampleUser);
    await logoutSession();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3502/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(getStoredUser()).toBeNull();
  });
});
