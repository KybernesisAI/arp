#!/usr/bin/env node
// Generate a throwaway test keypair + handoff bundle for ghost-reference.
// Mirrors samantha-reference/fixtures/gen-test-handoff.mjs; DID is
// `did:web:ghost.agent` with principal `did:web:nick.self.xyz`.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as ed25519 from '@noble/ed25519';

function base58btc(bytes) {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = A[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) out = '1' + out;
    else break;
  }
  return out;
}

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const outDir = resolve(outIdx >= 0 && argv[outIdx + 1] ? argv[outIdx + 1] : '.');
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'data', 'keys'), { recursive: true });

const priv = ed25519.utils.randomPrivateKey();
const pub = await ed25519.getPublicKeyAsync(priv);
const prefixed = new Uint8Array([0xed, 0x01, ...pub]);
const pubMb = 'z' + base58btc(prefixed);

writeFileSync(join(outDir, 'data', 'keys', 'private.key'), priv, { mode: 0o600 });

const handoff = {
  agent_did: 'did:web:ghost.agent',
  principal_did: 'did:web:nick.self.xyz',
  public_key_multibase: pubMb,
  well_known_urls: {
    did: 'https://ghost.agent/.well-known/did.json',
    agent_card: 'https://ghost.agent/.well-known/agent-card.json',
    arp: 'https://ghost.agent/.well-known/arp.json',
  },
  dns_records_published: [
    'A',
    '_arp TXT',
    '_did TXT',
    '_didcomm TXT',
    '_revocation TXT',
    '_principal TXT',
  ],
  cert_expires_at: '2035-01-01T00:00:00Z',
  bootstrap_token: 'test-bootstrap-token-rotate-before-prod',
};
writeFileSync(join(outDir, 'handoff.json'), JSON.stringify(handoff, null, 2));
console.error(`wrote handoff.json + data/keys/private.key to ${outDir}`);
console.error(`public key multibase: ${pubMb}`);
