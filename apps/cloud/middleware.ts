/**
 * HNS gateway bridge — Phase-7 Task 9.
 *
 * When a request arrives with a Host like `<owner>.<agent>.agent.hns.to`,
 * rewrite the URL to `/agent/<did>/...` on the app.arp.spec side. For
 * regular hosts (app.arp.spec, localhost) requests pass through unchanged.
 *
 * This runs on the Node.js Middleware runtime so it can reach into the
 * database via the cloud-db layer. Middleware cannot read cookies with
 * `cookies()` from next/headers; we decode the session inline from
 * req.cookies. For simplicity we do NOT authenticate in middleware —
 * auth happens at the page level. This middleware's only job is to
 * rewrite URLs based on the Host header.
 */

import { NextResponse, type NextRequest } from 'next/server';

export const config = {
  matcher: [
    // Run on everything except _next, static, and favicon.
    '/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};

export function middleware(req: NextRequest): NextResponse {
  const host = (req.headers.get('host') ?? '').toLowerCase();
  const xfwd = (req.headers.get('x-forwarded-host') ?? '').toLowerCase();
  const effective = xfwd || host;

  const agentDid = parseAgentDidFromHost(effective);
  if (!agentDid) return NextResponse.next();

  const url = req.nextUrl.clone();
  // If the path already targets /agent/<did>/... leave it alone; otherwise
  // rewrite `/` → `/agent/<did>/` so HNS visitors land on the agent's
  // owner page directly.
  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = `/agent/${encodeURIComponent(agentDid)}`;
  }
  // Expose the resolved DID downstream so server components + route
  // handlers can use the shortcut without re-parsing Host.
  const res = NextResponse.rewrite(url);
  res.headers.set('x-arp-agent-did', agentDid);
  return res;
}

export function parseAgentDidFromHost(host: string): string | null {
  const hostNoPort = host.replace(/:[0-9]+$/, '');
  if (!hostNoPort) return null;
  const hnsTo = '.hns.to';
  const core = hostNoPort.endsWith(hnsTo) ? hostNoPort.slice(0, -hnsTo.length) : hostNoPort;
  const labels = core.split('.');
  if (labels.length < 2) return null;
  if (labels[labels.length - 1] !== 'agent') return null;
  const agentLabel = labels[labels.length - 2];
  if (!agentLabel) return null;
  return `did:web:${agentLabel}.agent`;
}
