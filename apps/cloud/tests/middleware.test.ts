import { describe, it, expect } from 'vitest';
import type { NextRequest } from 'next/server';
import {
  parseAgentDidFromHost,
  surfaceForHost,
  rewriteForSurface,
  type Surface,
} from '../middleware';

describe('parseAgentDidFromHost (HNS bridge)', () => {
  it('extracts DID from bare .agent host', () => {
    expect(parseAgentDidFromHost('samantha.agent')).toBe('did:web:samantha.agent');
  });
  it('extracts DID from owner subdomain', () => {
    expect(parseAgentDidFromHost('ian.samantha.agent')).toBe('did:web:samantha.agent');
  });
  it('extracts DID from hns.to gateway', () => {
    expect(parseAgentDidFromHost('samantha.agent.hns.to')).toBe('did:web:samantha.agent');
    expect(parseAgentDidFromHost('ian.samantha.agent.hns.to')).toBe('did:web:samantha.agent');
  });
  it('strips port', () => {
    expect(parseAgentDidFromHost('samantha.agent:8080')).toBe('did:web:samantha.agent');
  });
  it('returns null for non-.agent hosts', () => {
    expect(parseAgentDidFromHost('arp.run')).toBeNull();
    expect(parseAgentDidFromHost('cloud.arp.run')).toBeNull();
    expect(parseAgentDidFromHost('app.arp.run')).toBeNull();
    expect(parseAgentDidFromHost('example.com')).toBeNull();
    expect(parseAgentDidFromHost('')).toBeNull();
    expect(parseAgentDidFromHost('localhost')).toBeNull();
  });
});

describe('surfaceForHost (host → surface dispatch)', () => {
  it('routes arp.run and www.arp.run to project', () => {
    expect(surfaceForHost('arp.run')).toBe<Surface>('project');
    expect(surfaceForHost('www.arp.run')).toBe<Surface>('project');
    expect(surfaceForHost('ARP.RUN')).toBe<Surface>('project'); // case-insensitive via stripPort lowercase
  });
  it('routes cloud.arp.run to cloud', () => {
    expect(surfaceForHost('cloud.arp.run')).toBe<Surface>('cloud');
  });
  it('routes app.arp.run to app', () => {
    expect(surfaceForHost('app.arp.run')).toBe<Surface>('app');
  });
  it('defaults unknown hosts to app surface', () => {
    expect(surfaceForHost('localhost')).toBe<Surface>('app');
    expect(surfaceForHost('localhost:3000')).toBe<Surface>('app');
    expect(surfaceForHost('arp-cloud-git-abc.vercel.app')).toBe<Surface>('app');
    expect(surfaceForHost('10.0.0.1')).toBe<Surface>('app');
  });
});

describe('rewriteForSurface', () => {
  // Minimal NextRequest stub — only pathname is read.
  function mockReq(pathname: string): NextRequest {
    const url = new URL(`https://localhost${pathname}`);
    return {
      nextUrl: {
        ...url,
        clone(): URL {
          return new URL(url.toString());
        },
      },
    } as unknown as NextRequest;
  }

  it('rewrites arp.run / → /project', () => {
    const res = rewriteForSurface(mockReq('/'), 'project');
    expect(res).not.toBeNull();
    expect(res?.headers.get('x-middleware-rewrite')).toContain('/project');
  });
  it('rewrites arp.run /about → /project/about', () => {
    const res = rewriteForSurface(mockReq('/about'), 'project');
    expect(res?.headers.get('x-middleware-rewrite')).toContain('/project/about');
  });
  it('leaves arp.run /project/* alone (no double-prefix)', () => {
    const res = rewriteForSurface(mockReq('/project/about'), 'project');
    expect(res).toBeNull();
  });
  it('never rewrites API routes', () => {
    expect(rewriteForSurface(mockReq('/api/tenants'), 'project')).toBeNull();
    expect(rewriteForSurface(mockReq('/api/tenants'), 'cloud')).toBeNull();
  });

  it('rewrites cloud.arp.run / → /cloud', () => {
    const res = rewriteForSurface(mockReq('/'), 'cloud');
    expect(res?.headers.get('x-middleware-rewrite')).toContain('/cloud');
  });
  it('rewrites cloud.arp.run /pricing → /cloud/pricing', () => {
    const res = rewriteForSurface(mockReq('/pricing'), 'cloud');
    expect(res?.headers.get('x-middleware-rewrite')).toContain('/cloud/pricing');
  });
  it('passes authenticated paths through on cloud surface', () => {
    // These must resolve to the top-level authenticated routes even when the
    // host is cloud.arp.run, so existing bookmarks + Stripe redirects work.
    expect(rewriteForSurface(mockReq('/dashboard'), 'cloud')).toBeNull();
    expect(rewriteForSurface(mockReq('/onboarding'), 'cloud')).toBeNull();
    expect(rewriteForSurface(mockReq('/billing'), 'cloud')).toBeNull();
    expect(rewriteForSurface(mockReq('/agent/did:web:foo.agent'), 'cloud')).toBeNull();
    expect(rewriteForSurface(mockReq('/settings/keys'), 'cloud')).toBeNull();
  });

  it('passes v2.1 routes through on cloud surface (onboard, internal, u)', () => {
    // Phase 9b: registrar-facing + DID-doc routes must resolve at the top
    // level on cloud.arp.run so external registrars can link directly.
    expect(rewriteForSurface(mockReq('/onboard'), 'cloud')).toBeNull();
    expect(
      rewriteForSurface(mockReq('/onboard?domain=x&registrar=y&callback=z'), 'cloud'),
    ).toBeNull();
    expect(rewriteForSurface(mockReq('/internal/registrar/bind'), 'cloud')).toBeNull();
    expect(
      rewriteForSurface(mockReq('/u/00000000-0000-0000-0000-000000000000/did.json'), 'cloud'),
    ).toBeNull();
  });

  it('passes app surface through untouched', () => {
    expect(rewriteForSurface(mockReq('/'), 'app')).toBeNull();
    expect(rewriteForSurface(mockReq('/dashboard'), 'app')).toBeNull();
    expect(rewriteForSurface(mockReq('/onboarding'), 'app')).toBeNull();
    expect(rewriteForSurface(mockReq('/api/tenants'), 'app')).toBeNull();
  });
});
