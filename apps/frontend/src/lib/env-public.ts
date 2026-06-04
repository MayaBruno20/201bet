/**
 * NEXT_PUBLIC_* é embutido em build time. Após mudar na Vercel, é preciso novo deploy.
 * Aceita só a origem (ex.: https://api.onrender.com) ou já com sufixo (/api).
 */

function readPublicEnvHost(key: 'NEXT_PUBLIC_SITE_HOST' | 'NEXT_PUBLIC_ADMIN_SITE_HOST'): string | null {
  const raw = process.env[key]?.trim().toLowerCase();
  return raw || null;
}

/** Host do site público (apex), sem protocolo — ex. `palpite201.com`. */
export function getConfiguredSiteHost(): string | null {
  return readPublicEnvHost('NEXT_PUBLIC_SITE_HOST');
}

/** Host do painel admin — ex. `admin.palpite201.com`. */
export function getConfiguredAdminSiteHost(): string | null {
  return readPublicEnvHost('NEXT_PUBLIC_ADMIN_SITE_HOST');
}

export function getPublicApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  const fallback = 'http://localhost:3502/api';
  if (!raw) return fallback;
  const base = raw.replace(/\/+$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

export function getPublicWsUrl(): string {
  const raw = process.env.NEXT_PUBLIC_WS_URL?.trim();
  const fallback = 'http://localhost:3502/realtime';
  if (!raw) return fallback;
  const base = raw.replace(/\/+$/, '');
  return base.endsWith('/realtime') ? base : `${base}/realtime`;
}

/**
 * URL pública do site (sem trailing slash). Usada pra montar deep-links — ex.: o
 * painel admin gera link compartilhável de embate personalizado: `${site}/apostas?duelId=...`.
 *
 * Ordem: `NEXT_PUBLIC_PUBLIC_SITE_URL` → `https://${NEXT_PUBLIC_SITE_HOST}` →
 * no browser, `window.location.origin` sem subdomínio `admin.`.
 */
export function getPublicSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, '');
  const siteHost = getConfiguredSiteHost();
  if (siteHost) return `https://${siteHost}`;
  if (typeof window === 'undefined') return 'http://localhost:3501';
  return window.location.origin.replace(/\/\/admin\./, '//');
}
