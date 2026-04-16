import type { CookieOptions, Response } from 'express';

/** Nome do cookie httpOnly com o JWT de acesso (não expor ao JS do browser). */
export const AUTH_ACCESS_COOKIE = '201bet_access';

/** Usado nos testes e alinhado ao cookie de sessão. */
export function jwtExpiresInToMilliseconds(expiresIn: string): number {
  const raw = expiresIn.trim();
  const match = raw.match(/^(\d+)(ms|s|m|h|d|w|y)$/);
  if (!match) {
    return 8 * 60 * 60 * 1000;
  }
  const n = parseInt(match[1], 10);
  const mult: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    y: 31_536_000_000,
  };
  return n * (mult[match[2]] ?? 3_600_000);
}

function resolveCookieMaxAgeMs(): number {
  return jwtExpiresInToMilliseconds(process.env.JWT_EXPIRES_IN ?? '8h');
}

function baseCookieOptions(): CookieOptions {
  const sameSite = process.env.AUTH_COOKIE_SAMESITE === 'none' ? 'none' : 'lax';
  const secure = sameSite === 'none' || process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: resolveCookieMaxAgeMs(),
    domain: process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined,
  };
}

export function attachAccessTokenCookie(res: Response, accessToken: string) {
  res.cookie(AUTH_ACCESS_COOKIE, accessToken, baseCookieOptions());
}

export function clearAccessTokenCookie(res: Response) {
  const { maxAge: _m, ...opts } = baseCookieOptions();
  res.clearCookie(AUTH_ACCESS_COOKIE, opts);
}
