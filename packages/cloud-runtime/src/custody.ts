/**
 * Cloud key custody opener (AgentID S4 / P2).
 *
 * Format-compatible with `apps/cloud/lib/key-custody.ts`: AES-256-GCM,
 * `v1:<iv>:<tag>:<ct>` with base64url parts, 32-byte Ed25519 seed inside.
 * The gateway only ever OPENS seeds (to sign replies + outbound requests for
 * cloud-custody identities); sealing stays in the cloud app.
 */

import { createDecipheriv, createHash } from 'node:crypto';

const SEAL_VERSION = 'v1';

export function openPrivateKey(sealed: string, key: Uint8Array): Uint8Array {
  const parts = sealed.split(':');
  if (parts.length !== 4 || parts[0] !== SEAL_VERSION) {
    throw new Error('openPrivateKey: unrecognised sealed format');
  }
  const [, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]);
  if (pt.length !== 32) throw new Error('openPrivateKey: unexpected plaintext length');
  return Uint8Array.from(pt);
}

function decodeKeyMaterial(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return Uint8Array.from(Buffer.from(trimmed, 'hex'));
  for (const enc of ['base64', 'base64url'] as const) {
    try {
      const buf = Buffer.from(trimmed, enc);
      if (buf.length === 32) return Uint8Array.from(buf);
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Resolve the sealing key from `ARP_CLOUD_KEY_ENCRYPTION_KEY`. Production
 * (`NODE_ENV=production`) refuses to run without it; elsewhere the same
 * deterministic dev key the cloud app derives is used so local + test
 * fixtures interoperate.
 */
export function sealingKeyFromEnv(env: NodeJS.ProcessEnv = process.env): Uint8Array {
  const configured = env['ARP_CLOUD_KEY_ENCRYPTION_KEY'];
  if (configured) {
    const key = decodeKeyMaterial(configured);
    if (!key) throw new Error('ARP_CLOUD_KEY_ENCRYPTION_KEY must be 32 bytes (hex or base64)');
    return key;
  }
  if (env['NODE_ENV'] === 'production') {
    throw new Error('ARP_CLOUD_KEY_ENCRYPTION_KEY must be set in production');
  }
  return Uint8Array.from(createHash('sha256').update('arp-cloud-dev-sealing-key').digest());
}
