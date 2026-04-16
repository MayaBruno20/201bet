import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicApiUrl, getPublicWsUrl } from './env-public';

describe('env-public', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getPublicApiUrl uses fallback when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    expect(getPublicApiUrl()).toBe('http://localhost:3502/api');
  });

  it('getPublicApiUrl appends /api when missing', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.example.com');
    expect(getPublicApiUrl()).toBe('http://api.example.com/api');
  });

  it('getPublicApiUrl keeps trailing path when already /api', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://x.com/api');
    expect(getPublicApiUrl()).toBe('https://x.com/api');
  });

  it('getPublicWsUrl uses fallback when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_WS_URL', '');
    expect(getPublicWsUrl()).toBe('http://localhost:3502/realtime');
  });

  it('getPublicWsUrl appends /realtime when missing', () => {
    vi.stubEnv('NEXT_PUBLIC_WS_URL', 'http://localhost:3502');
    expect(getPublicWsUrl()).toBe('http://localhost:3502/realtime');
  });
});
