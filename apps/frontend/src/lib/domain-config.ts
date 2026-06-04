import { getConfiguredAdminSiteHost, getConfiguredSiteHost } from '@/lib/env-public';

/**
 * Um único deploy Next: o host HTTP decide se servimos o site público ou o painel.
 * O painel vive em rotas internas prefixadas com `INTERNAL_ADMIN_PREFIX`; o middleware
 * faz rewrite do host admin para esse prefixo (URLs limpas no browser).
 *
 * Produção: defina no `.env` da raiz (ou Vercel):
 *   NEXT_PUBLIC_SITE_HOST=palpite201.com
 *   NEXT_PUBLIC_ADMIN_SITE_HOST=admin.palpite201.com
 */
export const INTERNAL_ADMIN_PREFIX = '/internal-admin';

export type SiteKind = 'public' | 'admin';

export function getSiteHost(): string | null {
  return getConfiguredSiteHost();
}

export function getAdminSiteHost(): string | null {
  return getConfiguredAdminSiteHost();
}

export function normalizeHost(host: string): string {
  return host.split(':')[0]?.toLowerCase() ?? '';
}

function hostMatchesConfigured(host: string, configured: string | null): boolean {
  if (!configured) return false;
  return host === configured || host === `www.${configured}`;
}

export function getSiteKindForHost(hostHeader: string | null): SiteKind {
  const host = normalizeHost(hostHeader ?? '');
  if (!host) return 'public';

  if (hostMatchesConfigured(host, getAdminSiteHost())) return 'admin';

  /**
   * Dev no mesmo deploy (sem env de produção):
   * - Safari costuma falhar em `admin.localhost` sem DNS. Corrija com:
   *     sudo sh -c 'echo "127.0.0.1 admin.localhost" >> /etc/hosts'
   * - Sem editar hosts: use nip.io → 127.0.0.1
   */
  if (host === 'admin.localhost' || host === 'admin.local') return 'admin';
  if (host === 'admin.127.0.0.1.nip.io') return 'admin';

  return 'public';
}

export function isPublicMarketingHost(hostHeader: string | null): boolean {
  return hostMatchesConfigured(normalizeHost(hostHeader ?? ''), getSiteHost());
}

/** Origem HTTPS do admin para redirects a partir do site público. */
export function getAdminPublicOrigin(): string {
  const adminHost = getAdminSiteHost();
  if (!adminHost) return 'https://admin.localhost';
  return `https://${adminHost}`;
}

/**
 * No host admin, links antigos `/admin` ou `/admin/...` viram caminhos do painel na raiz.
 */
export function stripLegacyAdminPath(pathname: string): string {
  if (pathname === '/admin') return '/';
  if (pathname.startsWith('/admin/')) {
    const rest = pathname.slice('/admin'.length);
    return rest.length ? rest : '/';
  }
  return pathname;
}

export function internalAdminPathFromUrlPath(pathname: string): string {
  const normalized = stripLegacyAdminPath(pathname);
  if (normalized === '/') return INTERNAL_ADMIN_PREFIX;
  return `${INTERNAL_ADMIN_PREFIX}${normalized}`;
}
