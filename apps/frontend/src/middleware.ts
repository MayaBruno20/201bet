import { NextResponse, type NextRequest } from 'next/server';
import {
  getSiteKindForHost,
  internalAdminPathFromUrlPath,
  isPublicMarketingHost,
  PUBLIC_DOMAIN,
  INTERNAL_ADMIN_PREFIX,
} from '@/lib/domain-config';

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

  if (isPublicMarketingHost(host) && pathname.startsWith(INTERNAL_ADMIN_PREFIX)) {
    return new NextResponse(null, { status: 404 });
  }

  if (getSiteKindForHost(host) === 'admin') {
    const url = req.nextUrl.clone();
    url.pathname = internalAdminPathFromUrlPath(pathname);
    return NextResponse.rewrite(url);
  }

  if (isPublicMarketingHost(host) && pathname.startsWith('/admin')) {
    const target = new URL(`https://${ADMIN_DOMAIN}${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(target, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
