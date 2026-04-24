/**
 * Host-based rewrites for the spec-site project.
 *
 * The spec-site serves three hostnames out of one Vercel deployment:
 *   - spec.arp.run   → default. Landing + /spec/* + /docs/* + /rfcs/* + /schema/* + /scope-catalog + /status + /posts
 *   - docs.arp.run   → currently the same tree; /docs/* is the primary intent but the root landing also renders
 *   - status.arp.run → should land on /status directly, not the spec-site landing
 *
 * This middleware inspects the Host header and rewrites the root path
 * to the correct entry point for each surface.
 */

import { NextResponse, type NextRequest } from 'next/server';

export const config = {
  matcher: [
    // Run on everything except _next, static, and favicon.
    '/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};

const STATUS_HOSTS = new Set<string>(['status.arp.run', 'www.status.arp.run']);

function stripPort(host: string): string {
  return host.replace(/:[0-9]+$/, '');
}

export function middleware(req: NextRequest): NextResponse {
  const host = stripPort((req.headers.get('host') ?? '').toLowerCase());
  const xfwd = stripPort((req.headers.get('x-forwarded-host') ?? '').toLowerCase());
  const effective = xfwd || host;

  // status.arp.run — rewrite bare root to /status. Deeper paths pass
  // through unchanged (so status.arp.run/spec, etc., still work if anyone
  // deep-links to them).
  if (STATUS_HOSTS.has(effective) && req.nextUrl.pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/status';
    const res = NextResponse.rewrite(url);
    res.headers.set('x-arp-surface', 'status');
    return res;
  }

  return NextResponse.next();
}
