import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from './lib/session-constants';

const PUBLIC_PATHS = new Set<string>([
  '/login',
  '/api/auth/challenge',
  '/api/auth/verify',
  '/api/auth/logout',
  '/api/health',
]);

/**
 * Require the session cookie on every non-login page. We don't validate the
 * HMAC here (edge middleware can't touch Node crypto APIs without extra
 * plumbing) — server components re-check via `getSession`. A missing cookie
 * is the common case we want to redirect, and an invalid cookie simply
 * falls through to the server-component check.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/static')
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|static).*)'],
};
