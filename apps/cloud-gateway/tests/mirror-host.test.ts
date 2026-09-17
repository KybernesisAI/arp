/**
 * AgentID S2 / T6 + T7: the ICANN mirror host serves the identity's well-known
 * documents, the self-hosted owner proof, and redirects `/` to the profile.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPgliteDb, agents, registrarBindings, tenants } from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import { startGateway } from '../src/index.js';

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
    await db.insert(agents).values({
      did: 'did:web:atlas.agent',
      tenantId,
      principalDid: 'did:key:z6MkT',
      agentName: 'Atlas',
      agentDescription: '',
      publicKeyMultibase: 'z6MkAtlas',
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

    const rep = await fetch(`${base}/representation.jwt`, { headers: host });
    expect(rep.status).toBe(200);
    expect(rep.headers.get('content-type')).toBe('application/jwt');
    expect(await rep.text()).toBe('eyJhbGciOiJFZERTQSJ9.e30.c2ln');
    const rep2 = await fetch(`${base}/.well-known/representation.jwt`, { headers: host });
    expect(rep2.status).toBe(200);

    const root = await fetch(`${base}/`, { headers: host, redirect: 'manual' });
    expect(root.status).toBe(302);
    expect(root.headers.get('location')).toBe('https://agent.arp.run/atlas');

    const unknown = await fetch(`${base}/representation.jwt`, { headers: { 'x-forwarded-host': 'nobody.agent.arp.run' } });
    expect(unknown.status).toBe(404);
    const bare = await fetch(`${base}/`, { headers: { 'x-forwarded-host': 'agent.arp.run' }, redirect: 'manual' });
    expect(bare.status).toBe(404);
  });
});
