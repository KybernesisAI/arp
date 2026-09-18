/**
 * Host dispatch + HNS gateway bridge.
 *
 * The cloud Next.js app serves three public hostnames from one deployment:
 *
 *   - arp.run          → project / open-source landing (routes rewritten to /project/*)
 *   - cloud.arp.run    → cloud marketing + signup (routes rewritten to /cloud/*)
 *   - app.arp.run      → authenticated dashboard (pass through to top-level routes)
 *   - agent.arp.run    → AgentID identity lander (routes rewritten to /agentid/*)
 *   - <sld>.agent.arp.run → AgentID ICANN mirror for one name: machine paths
 *     (/.well-known/*, /representation.jwt, /didcomm, /pairing) are proxied to
 *     the gateway with ?target=<sld>.agent; everything else renders the
 *     public profile. (Railway's plan caps custom domains per service, so the
 *     mirror lives on Vercel, which already owns the arp.run zone.)
 *
 * Plus the Phase-7 HNS bridge for `<owner>.<agent>.agent.hns.to` visitors,
 * which is still routed to `/agent/<did>/…` regardless of surface.
 *
 * Localhost + Vercel preview URLs default to the app surface so the dev
 * + staging flow stays identical to what developers already expect.
 *
 * Auth is NOT enforced here — every page enforces its own auth. Middleware
 * only rewrites paths.
 */

import { NextResponse, type NextRequest } from 'next/server';

export const config = {
  matcher: [
    // Run on everything except _next, static, and favicon.
    '/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};

export type Surface = 'project' | 'cloud' | 'app' | 'agentid' | 'mirror' | 'hns';

const PROJECT_HOSTS = new Set<string>(['arp.run', 'www.arp.run']);
const CLOUD_HOSTS = new Set<string>(['cloud.arp.run']);
const APP_HOSTS = new Set<string>(['app.arp.run']);
const AGENTID_HOSTS = new Set<string>(['agent.arp.run']);
/** ICANN mirror suffix — `<sld>.agent.arp.run`. Override for staging. */
const MIRROR_SUFFIX = (process.env['AGENTID_MIRROR_SUFFIX'] ?? '.agent.arp.run').toLowerCase();
const GATEWAY_ORIGIN = (process.env['ARP_CLOUD_GATEWAY_ORIGIN'] ?? 'https://gateway.arp.run').replace(/\/+$/, '');
/** Paths on a mirror host that belong to the identity's machine surface (served by the gateway). */
const MIRROR_GATEWAY_PATHS = ['/.well-known/', '/representation.jwt', '/didcomm', '/pairing', '/agent-connections', '/a2a'];

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
  if (CLOUD_HOSTS.has(bare)) return 'cloud';
  if (APP_HOSTS.has(bare)) return 'app';
  if (AGENTID_HOSTS.has(bare)) return 'agentid';
  if (mirrorSldFromHost(bare) !== null) return 'mirror';
  // Default: treat everything else (localhost, Vercel preview domains, ngrok
  // tunnels, IP literals) as the app surface so local dev + preview flows
  // behave identically to app.arp.run.
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

  if (surface === 'cloud') {
    if (pathname.startsWith('/api/')) return null;
    if (pathname.startsWith('/cloud/')) return null;
    if (pathname === '/cloud') return null;
    // The authenticated sub-tree (dashboard, onboarding, agent, billing,
    // settings) must remain reachable on cloud.arp.run so existing
    // bookmarks + Stripe webhook redirects continue to resolve.
    if (isAppOwnedPath(pathname)) return null;
    url.pathname = `/cloud${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(url);
  }

  if (surface === 'agentid') {
    if (pathname.startsWith('/api/')) return null;
    if (pathname.startsWith('/agentid/')) return null;
    if (pathname === '/agentid') return null;
    // Same passthrough set as the other marketing hosts so /legal, /support,
    // /pair etc. still resolve if someone lands on them via agent.arp.run.
    if (isAppOwnedPath(pathname)) return null;
    url.pathname = `/agentid${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(url);
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
  // `cloud.arp.run/onboard`, so it must not be rewritten under /cloud.
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
    // Phase 10a: URL-fragment pairing is reachable on cloud.arp.run — the
    // marketing surface's /cloud rewrite would bury the hash payload under
    // a non-existent route. Also enables the "open invite link in another
    // browser" smoke flow without forcing users onto app.arp.run.
    '/pair',
    // Phase 10b: connection list / detail / audit / revoke pages are
    // authenticated surfaces. They must resolve at the top level on both
    // cloud.arp.run (marketing host passthrough) and app.arp.run.
    '/connections',
    // AgentID S2: per-name records page in the console.
    '/names',
    // Standalone 3D identity badge (side quest, 2026-09-18); no lander chrome.
    '/badge',
    // New AgentID landing page (black hero + badge); app-owned so no lander rewrite.
    '/lander',
    // Static assets under public/assets (badge model etc.) must never be rewritten.
    '/assets',
    // /legal/* pages are referenced from footers on all three surfaces
    // (arp.run, cloud.arp.run, app.arp.run); pass through to the shared
    // /legal layout regardless of which host the user is on.
    '/legal',
    // Phase 10c: /support is linked from every surface's footer; the page is
    // static + auth-optional. Passthrough here prevents the /cloud rewrite
    // from burying it at /cloud/support.
    '/support',
    // /runtime: single-screen explainer slide for the seven-layer runtime +
    // policy gate. Same page on every host (arp.run, cloud.arp.run,
    // app.arp.run) — must not be rewritten under /project or /cloud.
    '/runtime',
  ];
  return appRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/**
 * `<sld>.agent.arp.run` (or `<owner>.<sld>.agent.arp.run`) → `<sld>`; null for
 * the bare `agent.arp.run` host or anything not under the mirror suffix.
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
  // otherwise we'd try to rewrite `arp.run` into `/agent/did:web:run`.
  if (labels[labels.length - 1] !== 'agent') return null;
  const agentLabel = labels[labels.length - 2];
  if (!agentLabel) return null;
  return `did:web:${agentLabel}.agent`;
}
