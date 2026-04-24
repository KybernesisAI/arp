import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { bootstrap } from '@kybernesis/arp-sidecar';

const DID = 'did:web:test.agent';
const PRINCIPAL_DID = 'did:web:ian.example.agent';

describe('sidecar bootstrap', () => {
  let dataDir!: string;
  let handoffPath!: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'arp-sidecar-test-'));
    handoffPath = join(dataDir, 'handoff.json');
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('generates keys, cert, and well-known docs on first boot and is idempotent on second boot', async () => {
    // Mint a keypair, drop the private key into the data dir, and write a
    // handoff committing to its public half.
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const pubMb = ed25519RawToMultibase(pub);
    seedPrivateKey(dataDir, priv);
    writeHandoff(handoffPath, pubMb);

    const first = await bootstrap({ handoffPath, dataDir });
    expect(first.publicKeyMultibase).toBe(pubMb);
    expect(first.firstBoot).toBe(true);
    expect(first.tlsFingerprint).toMatch(/^[0-9a-f]{64}$/);

    const fpPath = join(dataDir, 'certs', 'fingerprint.txt');
    const fp1 = readFileSync(fpPath, 'utf8');
    const didDoc1 = readFileSync(join(dataDir, 'well-known', 'did.json'), 'utf8');

    const mode = statSync(join(dataDir, 'keys', 'private.key')).mode & 0o777;
    expect(mode).toBe(0o600);

    // Second boot — must not regenerate anything.
    const second = await bootstrap({ handoffPath, dataDir });
    expect(second.firstBoot).toBe(false);
    expect(second.tlsFingerprint).toBe(first.tlsFingerprint);
    expect(readFileSync(fpPath, 'utf8')).toBe(fp1);
    expect(readFileSync(join(dataDir, 'well-known', 'did.json'), 'utf8')).toBe(didDoc1);
  });

  it('fails loudly when the public-key commitment does not match the on-disk key', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    seedPrivateKey(dataDir, priv);
    // Commit to a DIFFERENT key.
    const otherPriv = ed25519.utils.randomPrivateKey();
    const otherPub = await ed25519.getPublicKeyAsync(otherPriv);
    writeHandoff(handoffPath, ed25519RawToMultibase(otherPub));

    await expect(bootstrap({ handoffPath, dataDir })).rejects.toThrow(
      /public-key commitment mismatch/,
    );
  });

  it('refuses handoff bundles that ship a private key field', async () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    seedPrivateKey(dataDir, priv);
    const base = handoffFixture(ed25519RawToMultibase(pub));
    writeFileSync(
      handoffPath,
      JSON.stringify({ ...base, private_key: 'leaked-key-bytes' }),
    );

    await expect(bootstrap({ handoffPath, dataDir })).rejects.toThrow(
      /forbidden field/,
    );
  });

});

function seedPrivateKey(dataDir: string, priv: Uint8Array): void {
  const keysDir = join(dataDir, 'keys');
  mkdirSync(keysDir, { recursive: true });
  writeFileSync(join(keysDir, 'private.key'), priv, { mode: 0o600 });
}

function writeHandoff(path: string, pubMb: string): void {
  writeFileSync(path, JSON.stringify(handoffFixture(pubMb)));
}

function handoffFixture(pubMb: string): Record<string, unknown> {
  return {
    agent_did: DID,
    principal_did: PRINCIPAL_DID,
    public_key_multibase: pubMb,
    well_known_urls: {
      did: 'https://test.agent/.well-known/did.json',
      agent_card: 'https://test.agent/.well-known/agent-card.json',
      arp: 'https://test.agent/.well-known/arp.json',
    },
    dns_records_published: ['A', '_arp TXT', '_did TXT', '_didcomm TXT', '_principal TXT'],
    cert_expires_at: '2035-01-01T00:00:00Z',
    bootstrap_token: 'test-bootstrap-token-12345',
  };
}
