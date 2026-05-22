/**
 * NEXT_PUBLIC_* é embutido em build time. Após mudar na Vercel, é preciso novo deploy.
 * Aceita só a origem (ex.: https://api.onrender.com) ou já com sufixo (/api).
 */
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
 * Lê `NEXT_PUBLIC_PUBLIC_SITE_URL` (recomendado quando admin e site são origens
 * diferentes — `admin.201-bet.com` x `201-bet.com`). Fallback: `window.location.origin`,
 * removendo subdomínio `admin.` se presente.
 */
export function getPublicSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, '');
  if (typeof window === 'undefined') return 'http://localhost:3501';
  return window.location.origin.replace(/\/\/admin\./, '//');
}
