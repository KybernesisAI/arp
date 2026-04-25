#!/usr/bin/env node
/**
 * ARP Cloud gateway binary.
 *
 * Env vars:
 *   PORT                          — HTTP port (default 3001)
 *   DATABASE_URL                  — Neon Postgres connection string. When
 *                                   set, uses the Neon HTTP driver to share
 *                                   state with the cloud Next.js app
 *                                   (tenants, agents, registrar_bindings).
 *                                   Unset → PGlite in-memory (dev only).
 *   PGLITE_DATA_DIR               — optional file path for PGlite persistence
 *                                   when DATABASE_URL is unset.
 *   CEDAR_SCHEMA_PATH             — path to cedar-schema.json
 *   LOG_LEVEL                     — pino level
 *
 * The gateway does NOT serve any UI — the Next.js app (apps/cloud) does.
 * This binary only owns the DIDComm + WS + well-known surface.
 */

import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createNeonDb,
  createPgliteDb,
  type CloudDbClient,
} from '@kybernesis/arp-cloud-db';
import { createLogger } from '@kybernesis/arp-cloud-runtime';
import { startGateway, loadCedarSchema } from './index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const port = Number(process.env['PORT'] ?? 3001);
  const cedarPath = process.env['CEDAR_SCHEMA_PATH']
    ?? resolve(HERE, '..', '..', '..', 'packages', 'spec', 'src', 'cedar-schema.json');

  const logger = createLogger({ bindings: { service: 'arp-cloud-gateway' } });

  let db: CloudDbClient;
  if (process.env['DATABASE_URL']) {
    logger.info({ driver: 'neon-http' }, 'connecting to Postgres via Neon HTTP driver');
    db = createNeonDb({ connectionString: process.env['DATABASE_URL'] }).db;
  } else {
    logger.warn(
      { driver: 'pglite' },
      'DATABASE_URL unset — falling back to PGlite (dev only; gateway state will not be shared with cloud.arp.run)',
    );
    const { db: pgliteDb } = await createPgliteDb({
      ...(process.env['PGLITE_DATA_DIR'] ? { dataDir: process.env['PGLITE_DATA_DIR'] } : {}),
    });
    db = pgliteDb as unknown as CloudDbClient;
  }

  const cedarSchemaJson = loadCedarSchema(cedarPath);
  const handle = await startGateway(port, { db, cedarSchemaJson, logger });
  logger.info({ port: handle.port }, 'arp-cloud-gateway listening');

  const stop = async () => {
    logger.info({}, 'shutdown');
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

void main();
