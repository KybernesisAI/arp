import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openPrivateKey, sealingKeyFromEnv } from '../src/custody.js';

function seal(raw: Uint8Array, key: Uint8Array): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(raw), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

describe('custody opener (format-compatible with the cloud app)', () => {
  it('opens a seed sealed with the same key and rejects tampering / wrong key', () => {
    const key = Uint8Array.from(Buffer.from('ab'.repeat(32), 'hex'));
    const seed = randomBytes(32);
    const sealed = seal(seed, key);
    expect(Buffer.from(openPrivateKey(sealed, key))).toEqual(seed);
    expect(() => openPrivateKey(sealed, Uint8Array.from(Buffer.from('cd'.repeat(32), 'hex')))).toThrow();
    const [v, iv, tag, ct] = sealed.split(':') as [string, string, string, string];
    expect(() => openPrivateKey([v, iv, tag, ct.slice(0, -2) + (ct.endsWith('AA') ? 'BB' : 'AA')].join(':'), key)).toThrow();
    expect(() => openPrivateKey('v0:a:b:c', key)).toThrow(/unrecognised/);
  });
  it('derives the same dev key as the cloud app and fails closed in production', () => {
    const dev = sealingKeyFromEnv({} as NodeJS.ProcessEnv);
    expect(Buffer.from(dev).toString('hex')).toBe(
      // sha256('arp-cloud-dev-sealing-key') — must match apps/cloud/lib/key-custody.ts
      require('node:crypto').createHash('sha256').update('arp-cloud-dev-sealing-key').digest('hex'),
    );
    expect(() => sealingKeyFromEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/must be set/);
    expect(sealingKeyFromEnv({ ARP_CLOUD_KEY_ENCRYPTION_KEY: 'ab'.repeat(32) } as NodeJS.ProcessEnv)).toEqual(
      Uint8Array.from(Buffer.from('ab'.repeat(32), 'hex')),
    );
  });
});
