import { describe, expect, it } from 'vitest';
import { noSelfxyzPromptProbe } from '../src/probes/no-selfxyz-prompt.js';

function htmlFetch(body: string, status = 200): typeof fetch {
  return (async () =>
    new Response(body, {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })) as typeof fetch;
}

describe('noSelfxyzPromptProbe', () => {
  it('skips when no registrarSetupUrl is supplied', async () => {
    const r = await noSelfxyzPromptProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
    });
    expect(r.skipped).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('skips when the registrar page is unreachable (404)', async () => {
    const r = await noSelfxyzPromptProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      registrarSetupUrl: 'https://registrar.example/arp-setup',
      fetchImpl: htmlFetch('nope', 404),
    });
    expect(r.skipped).toBe(true);
  });

  it('passes (with no warnings) on a clean page', async () => {
    const r = await noSelfxyzPromptProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      registrarSetupUrl: 'https://registrar.example/arp-setup',
      fetchImpl: htmlFetch(
        '<html><body><h1>Register your .agent</h1><p>Use ARP Cloud.</p></body></html>',
      ),
    });
    expect(r.pass).toBe(true);
    expect(r.details['match_count']).toBe(0);
    expect(r.details['warnings']).toBeUndefined();
  });

  it('passes but warns on a page that mentions self.xyz', async () => {
    const r = await noSelfxyzPromptProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      registrarSetupUrl: 'https://registrar.example/arp-setup',
      fetchImpl: htmlFetch(
        '<html><body><h1>Sign in with Self.xyz</h1></body></html>',
      ),
    });
    // Warn-only — still a pass.
    expect(r.pass).toBe(true);
    expect(r.details['match_count']).toBe(1);
    expect(Array.isArray(r.details['warnings'])).toBe(true);
    expect(((r.details['warnings'] as string[]) ?? [])[0]).toContain('Self.xyz');
  });

  it('catches selfxyz without a dot', async () => {
    const r = await noSelfxyzPromptProbe({
      target: 'samantha.agent',
      baseUrl: 'https://samantha.agent',
      registrarSetupUrl: 'https://registrar.example/arp-setup',
      fetchImpl: htmlFetch('<html>SELFXYZ button here</html>'),
    });
    expect(r.pass).toBe(true);
    expect(r.details['match_count']).toBe(1);
  });
});
