import { describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { canonicalizeAgentCard, ed25519ToJwk, signAgentCard, verifyAgentCardSignature } from '../src/card-signing.js';

describe('A2A agent-card signing (spec §8.4)', () => {
  it('canonicalizes per the spec example (defaults removed, signatures excluded, JCS order)', () => {
    const card = {
      name: 'Example Agent',
      description: '',
      capabilities: { streaming: false, pushNotifications: false, extensions: [] },
      skills: [],
      signatures: [{ protected: 'x', signature: 'y' }],
    };
    expect(canonicalizeAgentCard(card)).toBe('{"capabilities":{"pushNotifications":false,"streaming":false},"description":"","name":"Example Agent","skills":[]}');
  });

  it('signs with an Ed25519 key and verifies via an OKP JWK; tampering and wrong keys fail', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const kid = 'did:web:atlas.agent#key-1';
    const card: Record<string, unknown> = {
      name: 'Atlas', description: 'test', version: '1', protocolVersion: '1.0',
      supportedInterfaces: [{ url: 'https://atlas.agent.arp.run/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
      capabilities: { streaming: false }, defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'], skills: [],
    };
    const sig = await signAgentCard(card, { privateKey: priv, kid, jku: 'https://atlas.agent.arp.run/.well-known/jwks.json' });
    const header = JSON.parse(Buffer.from(sig.protected, 'base64url').toString('utf8'));
    expect(header).toMatchObject({ alg: 'EdDSA', typ: 'JOSE', kid, jku: 'https://atlas.agent.arp.run/.well-known/jwks.json' });
    const signed = { ...card, signatures: [sig] };
    const jwks = { keys: [ed25519ToJwk(pub, kid)] };
    expect(await verifyAgentCardSignature(signed, jwks)).toEqual({ ok: true, kid, alg: 'EdDSA' });

    expect(await verifyAgentCardSignature({ ...signed, description: 'tampered' }, jwks)).toEqual({ ok: false, reason: 'bad_signature' });
    const otherPub = await ed25519.getPublicKeyAsync(ed25519.utils.randomPrivateKey());
    expect(await verifyAgentCardSignature(signed, { keys: [ed25519ToJwk(otherPub, kid)] })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(await verifyAgentCardSignature(signed, { keys: [ed25519ToJwk(pub, 'other#key')] })).toEqual({ ok: false, reason: 'unknown_key' });
    expect(await verifyAgentCardSignature(card, jwks)).toEqual({ ok: false, reason: 'no_signature' });
  });
});
