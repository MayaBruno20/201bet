import { NextResponse, type NextRequest } from 'next/server';

/**
 * O painel admin agora é um projeto Vercel separado em admin.201-bet.com
 * (gerenciado fora deste repositório).
 *
 * A única responsabilidade deste middleware aqui é:
 *   - Se alguém acessar `/admin/...` no host público (201-bet.com), redirecionar
 *     para o novo painel — defesa contra links antigos. Status 301 (permanente).
 *
 * Em dev (localhost), nenhum redirect — `/admin/*` simplesmente cai em 404 do
 * Next porque as rotas foram removidas.
 */
const PUBLIC_DOMAIN = '201-bet.com';
const ADMIN_DOMAIN = `admin.${PUBLIC_DOMAIN}`;

function isAsset(pathname: string) {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/uploads/') ||
    pathname.match(/\.(png|jpg|jpeg|webp|gif|svg|ico|json|xml|txt|woff2?|ttf|css|js|map)$/i)
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isAsset(pathname)) return NextResponse.next();

  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const isPublicHost = host === PUBLIC_DOMAIN || host === `www.${PUBLIC_DOMAIN}`;

  // Único caso especial: redireciona /admin/* do site público pro novo painel.
  if (isPublicHost && pathname.startsWith('/admin')) {
    const target = new URL(`https://${ADMIN_DOMAIN}${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(target, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
