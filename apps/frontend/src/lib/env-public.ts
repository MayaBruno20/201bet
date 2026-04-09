/**
 * NEXT_PUBLIC_* é embutido em build time. Após mudar na Vercel, é preciso novo deploy.
 * Aceita só a origem (https://app.fly.dev) ou já com sufixo (/api).
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
