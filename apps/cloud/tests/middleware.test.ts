import { describe, it, expect } from 'vitest';
import type { NextRequest } from 'next/server';
import {
  isAppOwnedPath,
  mirrorSldFromHost,
  rewriteForMirror,
  parseAgentDidFromHost,
  surfaceForHost,
  rewriteForSurface,
  type Surface,
} from '../middleware';

// Defaults from lib/origins.ts (no env in tests): agentid.dev / cloud.agentid.dev /
// <sld>.agentid.dev / gateway.agentid.dev.

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
    expect(parseAgentDidFromHost('agentid.dev')).toBeNull();
    expect(parseAgentDidFromHost('cloud.agentid.dev')).toBeNull();
    expect(parseAgentDidFromHost('samantha.agentid.dev')).toBeNull();
    expect(parseAgentDidFromHost('arp.run')).toBeNull();
    expect(parseAgentDidFromHost('example.com')).toBeNull();
    expect(parseAgentDidFromHost('')).toBeNull();
    expect(parseAgentDidFromHost('localhost')).toBeNull();
  });
});

describe('surfaceForHost (host → surface dispatch)', () => {
  it('routes arp.run and www.arp.run to the protocol landing', () => {
    expect(surfaceForHost('arp.run')).toBe<Surface>('project');
    expect(surfaceForHost('www.arp.run')).toBe<Surface>('project');
    expect(surfaceForHost('ARP.RUN')).toBe<Surface>('project');
  });
  it('routes agentid.dev and www to the site', () => {
    expect(surfaceForHost('agentid.dev')).toBe<Surface>('site');
    expect(surfaceForHost('www.agentid.dev')).toBe<Surface>('site');
    expect(surfaceForHost('AGENTID.DEV:443')).toBe<Surface>('site');
  });
  it('routes cloud.agentid.dev to the console', () => {
    expect(surfaceForHost('cloud.agentid.dev')).toBe<Surface>('app');
  });
  it('routes <sld>.agentid.dev to the mirror', () => {
    expect(surfaceForHost('samantha.agentid.dev')).toBe<Surface>('mirror');
  });
  it('old product hosts are not special any more', () => {
    expect(surfaceForHost('cloud.arp.run')).toBe<Surface>('app');
    expect(surfaceForHost('app.arp.run')).toBe<Surface>('app');
    expect(surfaceForHost('agent.arp.run')).toBe<Surface>('app');
    expect(surfaceForHost('samantha.agent.arp.run')).toBe<Surface>('app');
  });
  it('defaults unknown hosts to the console surface', () => {
    expect(surfaceForHost('localhost')).toBe<Surface>('app');
    expect(surfaceForHost('localhost:3000')).toBe<Surface>('app');
    expect(surfaceForHost('arp-cloud-git-abc.vercel.app')).toBe<Surface>('app');
    expect(surfaceForHost('10.0.0.1')).toBe<Surface>('app');
  });
  it('keeps app-owned paths on the app tree for every host', () => {
    expect(isAppOwnedPath('/names/samantha')).toBe(true);
    expect(isAppOwnedPath('/names')).toBe(true);
    expect(isAppOwnedPath('/badge')).toBe(true);
    expect(isAppOwnedPath('/lander')).toBe(true);
    expect(isAppOwnedPath('/gift')).toBe(true);
    expect(isAppOwnedPath('/i')).toBe(true);
    expect(isAppOwnedPath('/account')).toBe(true);
    expect(isAppOwnedPath('/identity')).toBe(false);
    expect(isAppOwnedPath('/assets/badge/card.glb')).toBe(true);
    expect(isAppOwnedPath('/namesake')).toBe(false);
  });
});

describe('rewriteForSurface', () => {
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
  const target = (res: ReturnType<typeof rewriteForSurface>): string | null => res?.headers.get('x-middleware-rewrite') ?? null;

  it('protocol landing: / → /project, /about → /project/about, no double prefix', () => {
    expect(target(rewriteForSurface(mockReq('/'), 'project'))).toContain('/project');
    expect(target(rewriteForSurface(mockReq('/about'), 'project'))).toContain('/project/about');
    expect(rewriteForSurface(mockReq('/project/about'), 'project')).toBeNull();
  });

  it('site: / is the lander', () => {
    expect(target(rewriteForSurface(mockReq('/'), 'site'))).toBe('https://localhost/lander');
    expect(rewriteForSurface(mockReq('/lander'), 'site')).toBeNull();
    expect(rewriteForSurface(mockReq('/lander/'), 'site')).toBeNull();
  });
  it('site: /<sld> is the public profile', () => {
    expect(target(rewriteForSurface(mockReq('/samantha'), 'site'))).toBe('https://localhost/agentid/samantha');
    expect(target(rewriteForSurface(mockReq('/Samantha/'), 'site'))).toBe('https://localhost/agentid/samantha');
    expect(target(rewriteForSurface(mockReq('/agentid-test'), 'site'))).toBe('https://localhost/agentid/agentid-test');
    expect(rewriteForSurface(mockReq('/agentid/samantha'), 'site')).toBeNull();
  });
  it('site: reserved words, nested paths and app-owned paths are never profiles', () => {
    for (const p of ['/pricing', '/support', '/badge', '/i', '/gift', '/pair', '/legal/terms', '/account', '/dashboard', '/assets/x.png', '/samantha/extra', '/-bad', '/api/x']) {
      const res = rewriteForSurface(mockReq(p), 'site');
      expect(res === null || !target(res)?.includes('/agentid/')).toBe(true);
    }
  });

  it('never rewrites API routes', () => {
    expect(rewriteForSurface(mockReq('/api/tenants'), 'project')).toBeNull();
    expect(rewriteForSurface(mockReq('/api/tenants'), 'site')).toBeNull();
    expect(rewriteForSurface(mockReq('/api/tenants'), 'app')).toBeNull();
  });

  it('console surface passes everything through', () => {
    for (const p of ['/', '/dashboard', '/onboarding', '/billing', '/agent/did:web:foo.agent', '/settings/keys', '/pair', '/pair/accept', '/connections', '/connections/abc-123/audit', '/onboard?domain=x', '/internal/registrar/bind', '/u/00000000-0000-0000-0000-000000000000/did.json', '/legal/terms', '/support', '/account', '/api/tenants']) {
      expect(rewriteForSurface(mockReq(p), 'app')).toBeNull();
    }
  });

  it('shared pages pass through on the site and the protocol landing', () => {
    for (const p of ['/legal', '/legal/terms', '/legal/privacy', '/legal/dpa', '/support', '/pair', '/pair/accept', '/i', '/gift', '/badge', '/onboard', '/names/samantha']) {
      expect(rewriteForSurface(mockReq(p), 'site')).toBeNull();
    }
    for (const p of ['/legal', '/legal/terms', '/support']) {
      expect(rewriteForSurface(mockReq(p), 'project')).toBeNull();
    }
  });
});

describe('mirror host (<sld>.agentid.dev)', () => {
  it('parses the sld and ignores the site host + unrelated hosts', () => {
    expect(mirrorSldFromHost('samantha.agentid.dev')).toBe('samantha');
    expect(mirrorSldFromHost('SAMANTHA.AGENTID.DEV:443')).toBe('samantha');
    expect(mirrorSldFromHost('ian.samantha.agentid.dev')).toBe('samantha');
    expect(mirrorSldFromHost('agentid.dev')).toBeNull();
    expect(mirrorSldFromHost('samantha.agent')).toBeNull();
    expect(mirrorSldFromHost('samantha.agent.arp.run')).toBeNull();
    // `cloud.agentid.dev` and `www.agentid.dev` match the suffix but are claimed first by surfaceForHost.
    expect(surfaceForHost('cloud.agentid.dev')).toBe<Surface>('app');
    expect(surfaceForHost('www.agentid.dev')).toBe<Surface>('site');
  });
  it('proxies machine paths to the gateway with ?target and renders the profile otherwise', () => {
    const mk = (path: string): NextRequest => {
      const url = new URL(`https://samantha.agentid.dev${path}`);
      return { nextUrl: { clone: () => new URL(url.toString()) } } as unknown as NextRequest;
    };
    const wk = rewriteForMirror(mk('/.well-known/did.json'), 'samantha.agentid.dev');
    expect(wk?.headers.get('x-middleware-rewrite')).toBe('https://gateway.agentid.dev/.well-known/did.json?target=samantha.agent');
    const avatar = rewriteForMirror(mk('/avatar.png'), 'samantha.agentid.dev');
    expect(avatar?.headers.get('x-middleware-rewrite')).toContain('/avatar.png');
    expect(avatar?.headers.get('x-middleware-rewrite')).toContain('target=samantha.agent');
    const rep = rewriteForMirror(mk('/representation.jwt?v=1'), 'samantha.agentid.dev');
    expect(rep?.headers.get('x-middleware-rewrite')).toBe('https://gateway.agentid.dev/representation.jwt?v=1&target=samantha.agent');
    const root = rewriteForMirror(mk('/'), 'samantha.agentid.dev');
    expect(root?.headers.get('x-middleware-rewrite')).toBe('https://samantha.agentid.dev/agentid/samantha');
    const other = rewriteForMirror(mk('/anything/else?x=1'), 'ian.samantha.agentid.dev');
    expect(other?.headers.get('x-middleware-rewrite')).toBe('https://samantha.agentid.dev/agentid/samantha');
    expect(rewriteForMirror(mk('/'), 'agentid.dev')).toBeNull();
  });
});
