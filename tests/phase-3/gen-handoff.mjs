#!/usr/bin/env node
// Generate a throwaway Ed25519 keypair and emit a handoff bundle + the raw
// private-key bytes, used by atlas-smoke.sh. Run from the repo root so node
// can resolve the hoisted @noble/ed25519 from apps/sidecar/node_modules or
// the workspace root.
//
// Args: <outDir>
// Writes: <outDir>/handoff.json, <outDir>/data/keys/private.key

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

const outDir = resolve(process.argv[2] ?? '.');
const priv = ed25519.utils.randomPrivateKey();
const pub = await ed25519.getPublicKeyAsync(priv);
const prefixed = new Uint8Array([0xed, 0x01, ...pub]);
const pubMb = 'z' + base58btc(prefixed);

mkdirSync(join(outDir, 'data', 'keys'), { recursive: true });
writeFileSync(join(outDir, 'data', 'keys', 'private.key'), priv, { mode: 0o600 });

const handoff = {
  agent_did: 'did:web:test.agent',
  principal_did: 'did:web:ian.example.agent',
  public_key_multibase: pubMb,
  well_known_urls: {
    did: 'https://test.agent/.well-known/did.json',
    agent_card: 'https://test.agent/.well-known/agent-card.json',
    arp: 'https://test.agent/.well-known/arp.json',
  },
  dns_records_published: ['A', '_arp TXT', '_did TXT', '_didcomm TXT', '_principal TXT'],
  cert_expires_at: '2035-01-01T00:00:00Z',
  bootstrap_token: 'smoke-test-bootstrap-token-do-not-use-in-prod',
};
writeFileSync(join(outDir, 'handoff.json'), JSON.stringify(handoff, null, 2));
console.log(pubMb);
