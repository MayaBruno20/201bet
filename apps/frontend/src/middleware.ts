import { NextResponse, type NextRequest } from 'next/server';

/**
 * Roteamento por hostname:
 *   - admin.201-bet.com  → só libera /admin/* (e o login do admin em /admin/login).
 *                           Acessar a raiz cai no painel; outras rotas → 404.
 *   - 201-bet.com (e www)→ bloqueia /admin/* (redireciona pro subdomínio).
 *
 * Em dev (localhost), tudo é permitido — a separação por hostname só faz sentido
 * em produção. Pra simular admin localmente, use `localhost:3501/admin/login`.
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
  const isAdminHost = host === ADMIN_DOMAIN;
  const isPublicHost = host === PUBLIC_DOMAIN || host === `www.${PUBLIC_DOMAIN}`;

  if (isAdminHost) {
    // Raiz do admin → manda pro painel (que por sua vez exige login).
    if (pathname === '/' || pathname === '') {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
    // Só liberamos rotas /admin/*. Tudo o mais é 404.
    if (!pathname.startsWith('/admin')) {
      return new NextResponse('Not Found', { status: 404 });
    }
    return NextResponse.next();
  }

  if (isPublicHost) {
    // /admin no site público → 301 pro subdomínio admin (defense in depth — mesmo
    // que alguém mude o build, o middleware impede acesso).
    if (pathname.startsWith('/admin')) {
      const target = new URL(`https://${ADMIN_DOMAIN}${pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(target, 301);
    }
    return NextResponse.next();
  }

  // Hosts desconhecidos (preview Vercel, IP direto, dev): comportamento livre.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
