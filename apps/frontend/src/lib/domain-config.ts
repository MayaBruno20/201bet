/**
 * Um único deploy Next: o host HTTP decide se servimos o site público ou o painel.
 * O painel vive em rotas internas prefixadas com `INTERNAL_ADMIN_PREFIX`; o middleware
 * faz rewrite do host admin para esse prefixo (URLs limpas no browser). O segmento não
 * usa `_` inicial para o Next App Router incluir as rotas no build.
 */
export const PUBLIC_DOMAIN = '201-bet.com';

/** Prefixo interno das rotas do admin (não expor no domínio público). */
export const INTERNAL_ADMIN_PREFIX = '/internal-admin';

const ADMIN_SUBDOMAIN = `admin.${PUBLIC_DOMAIN}`;

export type SiteKind = 'public' | 'admin';

export function normalizeHost(host: string): string {
  return host.split(':')[0]?.toLowerCase() ?? '';
}

export function getSiteKindForHost(hostHeader: string | null): SiteKind {
  const host = normalizeHost(hostHeader ?? '');
  if (!host) return 'public';
  if (host === ADMIN_SUBDOMAIN) return 'admin';
  if (host === `www.${ADMIN_SUBDOMAIN}`) return 'admin';
  /**
   * Dev no mesmo deploy:
   * - Safari costuma falhar em `admin.localhost` sem DNS. Corrija com:
   *     sudo sh -c 'echo "127.0.0.1 admin.localhost" >> /etc/hosts'
   * - Sem editar hosts (precisa de DNS na rede): use nip.io → 127.0.0.1
   */
  if (host === 'admin.localhost' || host === 'admin.local') return 'admin';
  if (host === 'admin.127.0.0.1.nip.io') return 'admin';
  return 'public';
}

export function isPublicMarketingHost(hostHeader: string | null): boolean {
  const host = normalizeHost(hostHeader ?? '');
  return host === PUBLIC_DOMAIN || host === `www.${PUBLIC_DOMAIN}`;
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
