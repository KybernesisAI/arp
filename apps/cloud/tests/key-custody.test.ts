/**
 * AgentID S2 / T3: sealing round-trip, fail-closed sealing key, and
 * mintIdentity for both custody modes.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { createPgliteDb, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient, TenantDb } from '@kybernesis/arp-cloud-db';
import { DidDocumentSchema, AgentCardSchema } from '@kybernesis/arp-spec';
import {
  IdentityExistsError,
  exportPrivateKey,
  mintIdentity,
  mirrorOriginFor,
  openPrivateKey,
  resetSealingKeyForTests,
  sealPrivateKey,
  sealingKey,
} from '../lib/key-custody';

const KEY_HEX = 'a'.repeat(64);

describe('sealing', () => {
  afterEach(() => resetSealingKeyForTests());

  it('round-trips a 32-byte seed and rejects tampering', () => {
    const key = sealingKey({ ARP_CLOUD_KEY_ENCRYPTION_KEY: KEY_HEX });
    const seed = ed25519.utils.randomPrivateKey();
    const sealed = sealPrivateKey(seed, key);
    expect(sealed.startsWith('v1:')).toBe(true);
    expect(sealed.split(':')).toHaveLength(4);
    expect(openPrivateKey(sealed, key)).toEqual(seed);

    const [v, iv, tag, ct] = sealed.split(':') as [string, string, string, string];
    const flipped = ct.slice(0, -2) + (ct.endsWith('AA') ? 'BB' : 'AA');
    expect(() => openPrivateKey([v, iv, tag, flipped].join(':'), key)).toThrow();
    expect(() => openPrivateKey(sealed, Uint8Array.from(Buffer.from('b'.repeat(64), 'hex')))).toThrow();
    expect(() => openPrivateKey('v0:x:y:z', key)).toThrow(/unrecognised/);
  });

  it('accepts hex, base64, and base64url key material', () => {
    const raw = Buffer.from(KEY_HEX, 'hex');
    resetSealingKeyForTests();
    expect(sealingKey({ ARP_CLOUD_KEY_ENCRYPTION_KEY: raw.toString('base64') })).toEqual(Uint8Array.from(raw));
    resetSealingKeyForTests();
    expect(sealingKey({ ARP_CLOUD_KEY_ENCRYPTION_KEY: raw.toString('base64url') })).toEqual(Uint8Array.from(raw));
    resetSealingKeyForTests();
    expect(() => sealingKey({ ARP_CLOUD_KEY_ENCRYPTION_KEY: 'too-short' })).toThrow(/32 bytes/);
  });

  it('derives a dev key outside production and refuses on production', () => {
    resetSealingKeyForTests();
    const dev = sealingKey({ ARP_CLOUD_KEY_ENCRYPTION_KEY: null, vercelEnv: 'preview' });
    expect(dev.length).toBe(32);
    resetSealingKeyForTests();
    expect(() => sealingKey({ ARP_CLOUD_KEY_ENCRYPTION_KEY: null, vercelEnv: 'production' })).toThrow(
      /ARP_CLOUD_KEY_ENCRYPTION_KEY must be set/,
    );
  });
});

describe('mintIdentity', () => {
  let db: CloudDbClient;
  let close: (() => Promise<void>) | null = null;
  let tdb: TenantDb;
  const key = Uint8Array.from(Buffer.from(KEY_HEX, 'hex'));
  const principalDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

  beforeEach(async () => {
    const built = await createPgliteDb();
    db = built.db as unknown as CloudDbClient;
    close = built.close;
    const rows = await db.insert(tenants).values({ principalDid }).returning({ id: tenants.id });
    tdb = withTenant(db, toTenantId(rows[0]!.id));
  });
  afterEach(async () => {
    if (close) await close();
    close = null;
  });

  it('mints a cloud-custody identity with no runtime, served from the mirror origin', async () => {
    const mirror = mirrorOriginFor('Atlas.agent', '.agent.arp.run');
    expect(mirror).toBe('https://atlas.agent.arp.run');

    const minted = await mintIdentity({
      tenantDb: tdb,
      domain: 'Atlas.agent',
      principalDid,
      agentName: 'Atlas',
      agentDescription: 'Test identity',
      custody: 'cloud',
      runtimeKind: 'none',
      wellKnownOrigin: mirror,
      mirrorOrigin: mirror,
      alsoKnownAs: ['nostr:npub1atlas'],
      sealKey: key,
    });

    expect(minted.agentDid).toBe('did:web:atlas.agent');
    expect(minted.row.keyCustody).toBe('cloud');
    expect(minted.row.runtimeKind).toBe('none');
    expect(minted.row.privateKeyEnc?.startsWith('v1:')).toBe(true);
    // The sealed seed is the one we returned.
    expect(openPrivateKey(minted.row.privateKeyEnc!, key)).toEqual(minted.privateKeyRaw);

    const didDoc = DidDocumentSchema.parse(minted.row.wellKnownDid);
    expect(didDoc.id).toBe('did:web:atlas.agent');
    expect(didDoc.alsoKnownAs).toEqual(['nostr:npub1atlas']); // mirror == origin → not duplicated
    expect(didDoc.service?.[0]?.serviceEndpoint).toBe('https://atlas.agent.arp.run/didcomm');
    expect(didDoc.verificationMethod[0]?.publicKeyMultibase).toBe(minted.publicKeyMultibase);

    const card = AgentCardSchema.parse(minted.row.wellKnownAgentCard);
    expect(card.name).toBe('Atlas');
    expect(card.endpoints.pairing).toBe('https://atlas.agent.arp.run/pairing');
    expect(minted.wellKnownUrls.did).toBe('https://atlas.agent.arp.run/.well-known/did.json');
    expect(minted.handoff['key_custody']).toBe('cloud');
  });

  it('mints an exported-custody bridge identity on the gateway origin and advertises the mirror', async () => {
    const minted = await mintIdentity({
      tenantDb: tdb,
      domain: 'nova.agent',
      principalDid,
      agentName: 'Nova',
      custody: 'exported',
      runtimeKind: 'bridge',
      wellKnownOrigin: 'https://gateway.arp.run',
      mirrorOrigin: 'https://nova.agent.arp.run',
      gatewayWsUrl: 'wss://gateway.arp.run/ws',
    });
    expect(minted.row.keyCustody).toBe('exported');
    expect(minted.row.privateKeyEnc).toBeNull();
    expect(minted.row.runtimeKind).toBe('bridge');
    const didDoc = DidDocumentSchema.parse(minted.row.wellKnownDid);
    expect(didDoc.alsoKnownAs).toEqual(['https://nova.agent.arp.run']);
    expect(didDoc.service?.[0]?.serviceEndpoint).toBe('https://gateway.arp.run/didcomm');
    expect(minted.handoff['gateway_ws_url']).toBe('wss://gateway.arp.run/ws');
    // Public key matches the returned seed.
    const pub = await ed25519.getPublicKeyAsync(minted.privateKeyRaw);
    expect(Buffer.from(pub).length).toBe(32);
  });

  it('refuses to overwrite unless forced, and force rotates the key', async () => {
    const first = await mintIdentity({
      tenantDb: tdb,
      domain: 'atlas.agent',
      principalDid,
      agentName: 'Atlas',
      custody: 'cloud',
      runtimeKind: 'none',
      wellKnownOrigin: 'https://atlas.agent.arp.run',
      sealKey: key,
    });
    await expect(
      mintIdentity({
        tenantDb: tdb,
        domain: 'atlas.agent',
        principalDid,
        agentName: 'Atlas',
        custody: 'cloud',
        runtimeKind: 'none',
        wellKnownOrigin: 'https://atlas.agent.arp.run',
        sealKey: key,
      }),
    ).rejects.toBeInstanceOf(IdentityExistsError);
    const second = await mintIdentity({
      tenantDb: tdb,
      domain: 'atlas.agent',
      principalDid,
      agentName: 'Atlas',
      custody: 'cloud',
      runtimeKind: 'none',
      wellKnownOrigin: 'https://atlas.agent.arp.run',
      sealKey: key,
      force: true,
    });
    expect(second.publicKeyMultibase).not.toBe(first.publicKeyMultibase);
    expect((await tdb.listAgents()).length).toBe(1);
  });

  it('exportPrivateKey returns the seed once and flips custody', async () => {
    const minted = await mintIdentity({
      tenantDb: tdb,
      domain: 'atlas.agent',
      principalDid,
      agentName: 'Atlas',
      custody: 'cloud',
      runtimeKind: 'none',
      wellKnownOrigin: 'https://atlas.agent.arp.run',
      sealKey: key,
    });
    const raw = await exportPrivateKey({ tenantDb: tdb, agentDid: minted.agentDid, sealKey: key });
    expect(raw).toEqual(minted.privateKeyRaw);
    const after = await tdb.getAgent(minted.agentDid);
    expect(after?.keyCustody).toBe('exported');
    expect(after?.privateKeyEnc).toBeNull();
    await expect(exportPrivateKey({ tenantDb: tdb, agentDid: minted.agentDid, sealKey: key })).rejects.toThrow(
      /not in cloud custody/,
    );
  });
});
