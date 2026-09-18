/**
 * AgentID S2 / T6 + T7: the ICANN mirror host serves the identity's well-known
 * documents, the self-hosted owner proof, and redirects `/` to the profile.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPgliteDb, agents, agentLinks, registrarBindings, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { startGateway } from '../src/index.js';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import * as ed25519 from '@noble/ed25519';

const CEDAR_SCHEMA_PATH = resolve(__dirname, '..', '..', '..', 'packages', 'spec', 'src', 'cedar-schema.json');

describe('mirror host', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.reverse()) await fn().catch(() => undefined);
    cleanups.length = 0;
  });

  it('serves well-known docs + representation.jwt on <sld>.agent.arp.run and redirects /', async () => {
    const { db, close } = await createPgliteDb();
    cleanups.push(close);
    const t = await db.insert(tenants).values({ principalDid: 'did:key:z6MkT' }).returning({ id: tenants.id });
    const tenantId = t[0]!.id;
    const atlasPub = await ed25519.getPublicKeyAsync(ed25519.utils.randomPrivateKey());
    await db.insert(agents).values({
      did: 'did:web:atlas.agent',
      tenantId,
      principalDid: 'did:key:z6MkT',
      agentName: 'Atlas',
      agentDescription: '',
      publicKeyMultibase: ed25519RawToMultibase(atlasPub),
      wellKnownA2aCard: { name: 'Atlas', protocolVersion: '1.0', supportedInterfaces: [{ url: 'https://atlas.agent.arp.run/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }] },
      handoffJson: {},
      wellKnownDid: { id: 'did:web:atlas.agent', alsoKnownAs: ['https://atlas.agent.arp.run'] },
      wellKnownAgentCard: { name: 'Atlas' },
      wellKnownArp: {},
      keyCustody: 'cloud',
      runtimeKind: 'none',
    });
    await db.insert(registrarBindings).values({
      tenantId,
      domain: 'atlas.agent',
      ownerLabel: 'ian',
      registrar: 'agentid',
      principalDid: 'did:key:z6MkT',
      publicKeyMultibase: 'z6MkT',
      representationJwt: 'eyJhbGciOiJFZERTQSJ9.e30.c2ln',
    });

    await db.insert(agentLinks).values({
      tenantId,
      agentDid: 'did:web:atlas.agent',
      kind: 'nostr',
      value: 'ab'.repeat(32),
      challenge: 'c',
      status: 'verified',
      verifiedAt: new Date(),
    });

    const gw = await startGateway(0, {
      db: db as unknown as CloudDbClient,
      cedarSchemaJson: readFileSync(CEDAR_SCHEMA_PATH, 'utf8'),
      mirrorSuffix: '.agent.arp.run',
      profileBase: 'https://agent.arp.run',
    });
    cleanups.push(() => gw.close());
    const base = `http://127.0.0.1:${gw.port}`;
    const host = { 'x-forwarded-host': 'atlas.agent.arp.run' };

    const did = await fetch(`${base}/.well-known/did.json`, { headers: host });
    expect(did.status).toBe(200);
    expect(((await did.json()) as { alsoKnownAs: string[] }).alsoKnownAs).toEqual(['https://atlas.agent.arp.run']);

    // AgentID S5: agent-card.json = A2A card, arp-card.json = ARP card, jwks = identity key.
    const a2a = (await (await fetch(`${base}/.well-known/agent-card.json`, { headers: host })).json()) as { protocolVersion?: string; name?: string };
    expect(a2a.protocolVersion).toBe('1.0');
    const arp = (await (await fetch(`${base}/.well-known/arp-card.json`, { headers: host })).json()) as { name?: string; protocolVersion?: string };
    expect(arp.name).toBe('Atlas');
    expect(arp.protocolVersion).toBeUndefined();
    const idJwks = (await (await fetch(`${base}/.well-known/jwks.json`, { headers: host })).json()) as { keys: Array<{ kty: string; crv: string; kid: string }> };
    expect(idJwks.keys).toEqual([expect.objectContaining({ kty: 'OKP', crv: 'Ed25519', kid: 'did:web:atlas.agent#key-1' })]);

    const rep = await fetch(`${base}/representation.jwt`, { headers: host });
    expect(rep.status).toBe(200);
    expect(rep.headers.get('content-type')).toBe('application/jwt');
    expect(await rep.text()).toBe('eyJhbGciOiJFZERTQSJ9.e30.c2ln');
    const rep2 = await fetch(`${base}/.well-known/representation.jwt`, { headers: host });
    expect(rep2.status).toBe(200);

    const nip05 = await fetch(`${base}/.well-known/nostr.json?name=_`, { headers: host });
    expect(nip05.status).toBe(200);
    expect(await nip05.json()).toEqual({ names: { _: 'ab'.repeat(32) } });
    const nip05Other = await fetch(`${base}/.well-known/nostr.json?name=bob`, { headers: host });
    expect(await nip05Other.json()).toEqual({ names: {} });

    const root = await fetch(`${base}/`, { headers: host, redirect: 'manual' });
    expect(root.status).toBe(302);
    expect(root.headers.get('location')).toBe('https://agent.arp.run/atlas');

    const unknown = await fetch(`${base}/representation.jwt`, { headers: { 'x-forwarded-host': 'nobody.agent.arp.run' } });
    expect(unknown.status).toBe(404);
    const bare = await fetch(`${base}/`, { headers: { 'x-forwarded-host': 'agent.arp.run' }, redirect: 'manual' });
    expect(bare.status).toBe(404);
  });
});
