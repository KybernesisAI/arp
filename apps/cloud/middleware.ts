/**
 * Host dispatch (AgentID, 2026-09-29) + the Phase-7 HNS bridge.
 *
 * One deployment serves:
 *
 *   - agentid.dev            → the site: lander at `/`, public profile at `/<sld>`,
 *                              badge at `/badge`; app-owned paths pass through
 *   - cloud.agentid.dev      → the signed-in console + API + webhooks
 *   - <sld>.agentid.dev      → an identity's machine surface: machine paths
 *                              (/.well-known/*, /representation.jwt, /avatar.png,
 *                              /didcomm, /pairing, /a2a …) proxy to the gateway with
 *                              ?target=<sld>.agent; anything else shows the profile
 *   - arp.run                → the ARP protocol's own open-source landing (/project/*);
 *                              nothing in the product links here
 *
 * Plus the HNS bridge for `<owner>.<agent>.agent.hns.to` visitors, routed to
 * `/agent/<did>/…` regardless of surface.
 *
 * Localhost + Vercel preview URLs default to the console surface.
 * Auth is NOT enforced here — every page enforces its own auth.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { RESERVED_NAMES, hostOf, origins } from '@/lib/origins';

export const config = {
  matcher: [
    // Run on everything except _next, static, and favicon.
    '/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};

export type Surface = 'project' | 'site' | 'app' | 'mirror' | 'hns';

const O = origins();
const PROJECT_HOSTS = new Set<string>(['arp.run', 'www.arp.run']);
const SITE_HOSTS = new Set<string>([hostOf(O.site), `www.${hostOf(O.site)}`]);
const APP_HOSTS = new Set<string>([hostOf(O.console)]);
/** ICANN mirror suffix — `<sld>.agentid.dev`. */
const MIRROR_SUFFIX = O.mirrorSuffix;
const GATEWAY_ORIGIN = O.gateway;
/** Paths on a mirror host that belong to the identity's machine surface (served by the gateway). */
const MIRROR_GATEWAY_PATHS = ['/.well-known/', '/representation.jwt', '/avatar.png', '/didcomm', '/pairing', '/agent-connections', '/a2a'];

export function middleware(req: NextRequest): NextResponse {
  const host = (req.headers.get('host') ?? '').toLowerCase();
  const xfwd = (req.headers.get('x-forwarded-host') ?? '').toLowerCase();
  const effective = stripPort(xfwd || host);

  // 1. HNS gateway branch — preserved from Phase 7.
  const agentDid = parseAgentDidFromHost(effective);
  if (agentDid) {
    const url = req.nextUrl.clone();
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = `/agent/${encodeURIComponent(agentDid)}`;
    }
    const res = NextResponse.rewrite(url);
    res.headers.set('x-arp-agent-did', agentDid);
    res.headers.set('x-arp-surface', 'hns');
    return res;
  }

  // 2. Host-based surface dispatch.
  const surface = surfaceForHost(effective);
  const rewritten =
    surface === 'mirror' ? rewriteForMirror(req, effective) : rewriteForSurface(req, surface);
  const res = rewritten ?? NextResponse.next();
  res.headers.set('x-arp-surface', surface);
  return res;
}

export function surfaceForHost(host: string): Surface {
  const bare = stripPort(host).toLowerCase();
  if (PROJECT_HOSTS.has(bare)) return 'project';
  if (SITE_HOSTS.has(bare)) return 'site';
  if (APP_HOSTS.has(bare)) return 'app';
  if (mirrorSldFromHost(bare) !== null) return 'mirror';
  // Default: localhost, Vercel preview domains, tunnels, IP literals → console.
  return 'app';
}

export function rewriteForSurface(
  req: NextRequest,
  surface: Surface,
): NextResponse | null {
  const url = req.nextUrl.clone();
  const pathname = url.pathname;

  if (surface === 'project') {
    // Skip API routes and already-rewritten paths.
    if (pathname.startsWith('/api/')) return null;
    if (pathname.startsWith('/project/')) return null;
    if (pathname === '/project') return null;
    // Legal pages are cross-surface — the shared /legal layout owns the
    // route. Footers on arp.run link to /legal/terms etc. directly.
    if (isAppOwnedPath(pathname)) return null;
    url.pathname = `/project${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(url);
  }

  if (surface === 'site') {
    if (pathname.startsWith('/api/')) return null;
    // The lander is the site's root.
    if (pathname === '/' || pathname === '') {
      url.pathname = '/lander';
      return NextResponse.rewrite(url);
    }
    if (pathname === '/lander' || pathname.startsWith('/lander/')) return null;
    // Marketing anchors that people type as paths.
    if (pathname === '/pricing' || pathname === '/faq' || pathname === '/how') {
      url.pathname = '/';
      url.hash = pathname.slice(1);
      return NextResponse.redirect(url, 308);
    }
    if (pathname.startsWith('/agentid/')) return null;
    // App-owned paths (badge, legal, support, pair, gift, short links …) pass through.
    if (isAppOwnedPath(pathname)) return null;
    // `/<sld>` → the public profile. One label, valid name, not a reserved word.
    const m = /^\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)\/?$/i.exec(pathname);
    if (m && m[1] && !RESERVED_NAMES.has(m[1].toLowerCase())) {
      url.pathname = `/agentid/${m[1].toLowerCase()}`;
      return NextResponse.rewrite(url);
    }
    return null;
  }

  // surface === 'app': pass through.
  return null;
}

export function isAppOwnedPath(pathname: string): boolean {
  // Paths that belong to the authenticated app surface and must NOT be
  // rewritten into the marketing tree.
  //
  // `/onboard` is the v2.1 TLD registrar entry point (used by Headless's
  // Option A redirect); external registrars link directly to
  // the console's `/onboard`, so it must never be rewritten.
  // `/internal` is the PSK-authenticated server-to-server callback space.
  // `/u` serves cloud-managed DID documents.
  const appRoots = [
    '/dashboard',
    '/onboarding',
    '/onboard',
    '/agent',
    '/billing',
    '/settings',
    '/internal',
    '/u',
    // URL-fragment pairing links.
    '/pair',
    // Connection list / detail / audit / revoke pages.
    '/connections',
    // AgentID S2: per-name records page in the console.
    '/names',
    // AgentID S6d: the owner's account page (name, email sign-in, passkeys, recovery phrase).
    '/account',
    // Customer docs on the site (agentid.dev/docs).
    '/docs',
    // Standalone 3D identity badge (side quest, 2026-09-18); no lander chrome.
    '/badge',
    // New AgentID landing page (black hero + badge); app-owned so no lander rewrite.
    '/lander',
    // AgentID: accept a gifted name (token in the URL fragment, like /pair/accept).
    '/gift',
    // Short pairing-invitation links (token in the fragment).
    '/i',
    // Static assets under public/assets (badge model etc.) must never be rewritten.
    '/assets',
    // /legal/* pages are shared by every host.
    '/legal',
    // Phase 10c: /support is linked from every surface's footer; the page is
    // static + auth-optional. Passthrough here prevents the /cloud rewrite
    // from burying it at /cloud/support.
    '/support',
  ];
  return appRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/**
 * `<sld>.agentid.dev` (or `<owner>.<sld>.agentid.dev`) → `<sld>`; null for the
 * bare site host or anything not under the mirror suffix.
 */
export function mirrorSldFromHost(host: string, suffix: string = MIRROR_SUFFIX): string | null {
  const bare = stripPort(host).toLowerCase();
  if (!bare.endsWith(suffix) || bare.length <= suffix.length) return null;
  const labels = bare.slice(0, -suffix.length).split('.').filter((l) => l.length > 0);
  const sld = labels[labels.length - 1];
  if (!sld || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(sld)) return null;
  return sld;
}

/**
 * Mirror host routing. Machine paths proxy to the gateway (external rewrite
 * carrying `?target=<sld>.agent` so the gateway resolves the same identity
 * it would for the HNS hostname); every other path renders the profile.
 */
export function rewriteForMirror(req: NextRequest, host: string): NextResponse | null {
  const sld = mirrorSldFromHost(host);
  if (!sld) return null;
  const url = req.nextUrl.clone();
  const pathname = url.pathname;
  if (MIRROR_GATEWAY_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    const target = new URL(`${GATEWAY_ORIGIN}${pathname}`);
    url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
    target.searchParams.set('target', `${sld}.agent`);
    return NextResponse.rewrite(target);
  }
  url.pathname = `/agentid/${sld}`;
  url.search = '';
  return NextResponse.rewrite(url);
}

function stripPort(host: string): string {
  return host.replace(/:[0-9]+$/, '');
}

export function parseAgentDidFromHost(host: string): string | null {
  const hostNoPort = stripPort(host);
  if (!hostNoPort) return null;
  const hnsTo = '.hns.to';
  const core = hostNoPort.endsWith(hnsTo) ? hostNoPort.slice(0, -hnsTo.length) : hostNoPort;
  const labels = core.split('.');
  if (labels.length < 2) return null;
  // The HNS bridge specifically matches `<label>.agent` or
  // `<owner>.<label>.agent`. Bail out if the TLD is something else —
  // otherwise we'd try to rewrite `agentid.dev` into `/agent/did:web:dev`.
  if (labels[labels.length - 1] !== 'agent') return null;
  const agentLabel = labels[labels.length - 2];
  if (!agentLabel) return null;
  return `did:web:${agentLabel}.agent`;
}
