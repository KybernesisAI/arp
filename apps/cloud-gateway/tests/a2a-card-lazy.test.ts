/**
 * AgentID S5: a cloud-custody identity with no stored A2A card gets one
 * built, signed with its own key and persisted on first fetch; exported
 * custody gets a schema-valid unsigned card.
 */

import { createCipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { exportJWK, generateKeyPair } from 'jose';
import { createPgliteDb, tenants, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { A2aAgentCardSchema, ARP_A2A_EXTENSION_URI } from '@kybernesis/arp-spec';
import { ed25519RawToMultibase, verifyAgentCardSignature } from '@kybernesis/arp-transport';
import { startGateway } from '../src/index.js';

const CEDAR_SCHEMA_PATH = resolve(__dirname, '..', '..', '..', 'packages', 'spec', 'src', 'cedar-schema.json');
const SEAL = Uint8Array.from(Buffer.from('e'.repeat(64), 'hex'));
const ATLAS = 'did:web:atlas.agent';
const GHOST = 'did:web:ghost.agent';

function seal(raw: Uint8Array): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', SEAL, iv);
  const ct = Buffer.concat([c.update(raw), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

describe('lazy A2A card backfill (AgentID S5)', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.reverse()) await fn().catch(() => undefined);
    cleanups.length = 0;
  });

  it('builds, signs and persists the card for cloud custody; unsigned card for exported', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(privateKey)), kid: 'test-push', alg: 'ES256' };
    const { db, close } = await createPgliteDb();
    cleanups.push(close);
    const t1 = (await db.insert(tenants).values({ principalDid: 'did:key:z1' }).returning({ id: tenants.id }))[0]!.id;
    const tdb = withTenant(db as unknown as CloudDbClient, toTenantId(t1));
    const priv = ed25519.utils.randomPrivateKey();
    const pub = await ed25519.getPublicKeyAsync(priv);
    const seed = (did: string, custody: 'cloud' | 'exported') =>
      tdb.createAgent({
        did, principalDid: 'did:key:zX', agentName: did === ATLAS ? 'Atlas' : 'Ghost', agentDescription: 'A test agent',
        publicKeyMultibase: ed25519RawToMultibase(pub), handoffJson: {},
        wellKnownDid: { id: did, service: [{ id: `${did}#card`, type: 'AgentCard', serviceEndpoint: `https://${did.replace('did:web:', '')}.arp.run/.well-known/arp-card.json` }] },
        wellKnownAgentCard: { did, name: 'arp-card' }, wellKnownArp: {}, scopeCatalogVersion: 'v1', tlsFingerprint: 'cloud-hosted',
        keyCustody: custody, privateKeyEnc: custody === 'cloud' ? seal(priv) : null, runtimeKind: 'none',
      });
    await seed(ATLAS, 'cloud');
    await seed(GHOST, 'exported');
    expect((await tdb.getAgent(ATLAS))?.wellKnownA2aCard).toBeNull();

    const gw = await startGateway(0, {
      db: db as unknown as CloudDbClient, cedarSchemaJson: readFileSync(CEDAR_SCHEMA_PATH, 'utf8'),
      pushSigningJwk: JSON.stringify(jwk), pushIssuer: 'http://gateway.test', sealingKey: SEAL, mirrorSuffix: '.arp.run',
    });
    cleanups.push(() => gw.close());
    const base = `http://127.0.0.1:${gw.port}`;

    const res = await fetch(`${base}/.well-known/agent-card.json?target=atlas.agent.arp.run`);
    expect(res.status).toBe(200);
    const card = A2aAgentCardSchema.parse(await res.json());
    expect(card.supportedInterfaces[0]).toMatchObject({ url: 'https://atlas.agent.arp.run/a2a', protocolBinding: 'JSONRPC' });
    expect(card.capabilities?.extensions?.[0]?.uri).toBe(ARP_A2A_EXTENSION_URI);
    expect(card.signatures).toHaveLength(1);
    const jwks = (await (await fetch(`${base}/.well-known/jwks.json?target=atlas.agent.arp.run`)).json()) as { keys: never[] };
    expect(await verifyAgentCardSignature(card as Record<string, unknown>, jwks)).toMatchObject({ ok: true });
    // Persisted: the row now carries the signed card and the second fetch serves it verbatim.
    expect((await tdb.getAgent(ATLAS))?.wellKnownA2aCard).toMatchObject({ name: 'Atlas' });
    const again = A2aAgentCardSchema.parse(await (await fetch(`${base}/.well-known/agent-card.json?target=atlas.agent.arp.run`)).json());
    expect(again.signatures?.[0]?.signature).toBe(card.signatures?.[0]?.signature);

    // Exported custody: nothing to sign with → schema-valid UNSIGNED A2A card, persisted.
    const ghost = A2aAgentCardSchema.parse(await (await fetch(`${base}/.well-known/agent-card.json?target=ghost.agent.arp.run`)).json());
    expect(ghost.name).toBe('Ghost');
    expect(ghost.supportedInterfaces[0]?.url).toBe('https://ghost.agent.arp.run/a2a');
    expect(ghost.signatures ?? []).toHaveLength(0);
    expect((await tdb.getAgent(GHOST))?.wellKnownA2aCard).toMatchObject({ name: 'Ghost' });
  }, 30_000);
});
