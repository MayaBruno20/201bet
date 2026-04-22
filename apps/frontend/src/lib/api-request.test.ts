import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, getApiBaseUrl } from './api-request';
import { AUTH_ACCESS_TOKEN_KEY } from './auth-token';

describe('api-request', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('getApiBaseUrl trims trailing slash from env', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3502/api/');
    expect(getApiBaseUrl()).toBe('http://localhost:3502/api');
  });

  it('apiFetch passes credentials include', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3502/api');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('http://localhost:3502/api/health');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3502/api/health',
      expect.objectContaining({
        credentials: 'include',
      }),
    );
  });

  it('apiFetch forwards bearer token from sessionStorage when available', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3502/api');
    window.sessionStorage.setItem(AUTH_ACCESS_TOKEN_KEY, 'jwt-fallback-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('http://localhost:3502/api/auth/me');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3502/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.any(Headers),
      }),
    );

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer jwt-fallback-token');
  });
});
