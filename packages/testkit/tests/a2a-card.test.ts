import { describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { buildA2aAgentCard } from '@kybernesis/arp-templates';
import { ed25519ToJwk, signAgentCard } from '@kybernesis/arp-transport';
import { a2aCardProbe } from '../src/probes/a2a-card.js';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

describe('a2a-card probe (AgentID S5)', () => {
  it('passes for a signed card whose jku JWKS verifies, fails on tamper, warns when unsigned', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const did = 'did:web:atlas.agent';
    const origin = 'https://atlas.agent.arp.run';
    const card = buildA2aAgentCard({ name: 'Atlas', did, origin, pairUrl: 'https://cloud.arp.run/pair?peer=did%3Aweb%3Aatlas.agent' }) as Record<string, unknown>;
    const sig = await signAgentCard(card, { privateKey: priv, kid: `${did}#key-1`, jku: `${origin}/.well-known/jwks.json` });
    const signed = { ...card, signatures: [sig] };
    const jwks = { keys: [ed25519ToJwk(pub, `${did}#key-1`)] };

    const serve = (c: unknown) => (async (input: string | URL) => {
      const u = String(input);
      if (u.endsWith('/.well-known/agent-card.json')) return json(c);
      if (u.endsWith('/.well-known/jwks.json')) return json(jwks);
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const ok = await a2aCardProbe({ target: 'atlas.agent', baseUrl: origin, fetchImpl: serve(signed) });
    expect(ok.pass).toBe(true);
    expect(ok.details['signature']).toMatchObject({ ok: true });

    const bad = await a2aCardProbe({ target: 'atlas.agent', baseUrl: origin, fetchImpl: serve({ ...signed, name: 'Mallory' }) });
    expect(bad.pass).toBe(false);
    expect(bad.error?.message).toMatch(/signature: bad_signature/);

    const unsigned = await a2aCardProbe({ target: 'atlas.agent', baseUrl: origin, fetchImpl: serve(card) });
    expect(unsigned.pass).toBe(true);
    expect(unsigned.details.warnings).toEqual(['card is unsigned']);

    const missing = await a2aCardProbe({ target: 'atlas.agent', baseUrl: origin, fetchImpl: serve({ ...signed, capabilities: { streaming: false } }) });
    expect(missing.pass).toBe(false);
    expect(missing.error?.message).toMatch(/missing ARP extension/);
  });
});
