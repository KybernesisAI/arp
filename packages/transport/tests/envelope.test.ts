import { describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import {
  signEnvelope,
  verifyEnvelope,
  multibaseEd25519ToRaw,
  ed25519RawToMultibase,
} from '../src/envelope.js';

describe('signEnvelope / verifyEnvelope', () => {
  it('round-trips a message and verifies with the paired public key', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const signed = await signEnvelope({
      message: {
        id: 'msg-1',
        type: 'https://didcomm.org/arp/1.0/ping',
        from: 'did:web:samantha.agent',
        to: ['did:web:ghost.agent'],
        body: { text: 'hello' },
      },
      signerDid: 'did:web:samantha.agent',
      privateKey: priv,
    });
    expect(signed.compact.split('.')).toHaveLength(3);
    const v = await verifyEnvelope(signed.compact, pub);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.message.body).toEqual({ text: 'hello' });
      expect(v.header.kid).toBe('did:web:samantha.agent#key-1');
    }
  });

  it('rejects a tampered payload', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const signed = await signEnvelope({
      message: {
        id: 'msg-2',
        type: 'https://didcomm.org/arp/1.0/ping',
        from: 'did:web:samantha.agent',
        to: ['did:web:ghost.agent'],
        body: { text: 'original' },
      },
      signerDid: 'did:web:samantha.agent',
      privateKey: priv,
    });
    // Tamper the payload segment — replace one char with a distinct one.
    const parts = signed.compact.split('.');
    parts[1] = parts[1]!.startsWith('A') ? `B${parts[1]!.slice(1)}` : `A${parts[1]!.slice(1)}`;
    const tampered = parts.join('.');
    const v = await verifyEnvelope(tampered, pub);
    expect(v.ok).toBe(false);
  });

  it('rejects a wrong-key signature', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const wrongPub = await ed25519.getPublicKeyAsync(ed25519.utils.randomPrivateKey());
    const signed = await signEnvelope({
      message: {
        id: 'msg-3',
        type: 'https://didcomm.org/arp/1.0/ping',
        from: 'did:web:samantha.agent',
        to: ['did:web:ghost.agent'],
        body: {},
      },
      signerDid: 'did:web:samantha.agent',
      privateKey: priv,
    });
    const v = await verifyEnvelope(signed.compact, wrongPub);
    expect(v.ok).toBe(false);
  });
});

describe('multibase ed25519 encoding', () => {
  it('round-trips a raw 32-byte key', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const mb = ed25519RawToMultibase(pub);
    expect(mb.startsWith('z')).toBe(true);
    const back = multibaseEd25519ToRaw(mb);
    expect(Buffer.from(back).equals(Buffer.from(pub))).toBe(true);
  });
});
