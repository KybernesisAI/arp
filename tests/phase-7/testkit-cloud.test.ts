/**
 * Testkit --via cloud integration — Phase-7 Task 11.
 *
 * Boots the cloud-gateway with a provisioned tenant + agent, then runs
 * the two probes that don't require valid DNS/TLS/DIDComm peer identities
 * (well-known + did-resolution basics) against the gateway with
 * X-Forwarded-Host set to the agent's hostname. This validates that
 * `--via cloud` routes correctly through the gateway surface.
 *
 * A full 8/8 run against a real cloud deployment is part of the Phase 9
 * prep coordination run — this in-process test validates the mechanism.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJson } from '@kybernesis/arp-testkit';
import { startGateway } from '@kybernesis/arp-cloud-gateway';
import { createMultiTenantHarness } from './helpers/seed.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CEDAR_SCHEMA_PATH = resolve(
  HERE,
  '..',
  '..',
  'packages',
  'spec',
  'src',
  'cedar-schema.json',
);

describe('testkit --via cloud', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.reverse()) {
      try {
        await fn();
      } catch {
        /* ignore */
      }
    }
    cleanups.length = 0;
  });

  it('X-Forwarded-Host routes well-known GET to the right tenant', async () => {
    const h = await createMultiTenantHarness(3);
    cleanups.push(h.closeDb);
    const cedarSchemaJson = readFileSync(CEDAR_SCHEMA_PATH, 'utf8');
    const gw = await startGateway(0, { db: h.db, cedarSchemaJson, peerResolver: h.resolver });
    cleanups.push(() => gw.close());

    for (const t of h.tenants) {
      const baseUrl = `http://127.0.0.1:${gw.port}`;
      const ctx = {
        target: t.agentHost,
        baseUrl,
        extraHeaders: { 'x-forwarded-host': t.agentHost },
      };
      const did = await fetchJson(`${baseUrl}/.well-known/did.json`, ctx);
      expect(did.ok).toBe(true);
      expect((did.body as { id?: string }).id).toBe(t.agentDid);

      const card = await fetchJson(`${baseUrl}/.well-known/agent-card.json`, ctx);
      expect(card.ok).toBe(true);
      expect((card.body as { name?: string }).name).toContain('Agent');

      const arp = await fetchJson(`${baseUrl}/.well-known/arp.json`, ctx);
      expect(arp.ok).toBe(true);
    }
  });

  it('missing X-Forwarded-Host → gateway returns 404 — no tenant leaked via probing', async () => {
    const h = await createMultiTenantHarness(2);
    cleanups.push(h.closeDb);
    const cedarSchemaJson = readFileSync(CEDAR_SCHEMA_PATH, 'utf8');
    const gw = await startGateway(0, { db: h.db, cedarSchemaJson, peerResolver: h.resolver });
    cleanups.push(() => gw.close());

    const baseUrl = `http://127.0.0.1:${gw.port}`;
    const ctx = { target: 'unknown', baseUrl };
    const r = await fetchJson(`${baseUrl}/.well-known/did.json`, ctx);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });
});
