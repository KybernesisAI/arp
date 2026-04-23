#!/usr/bin/env node
/**
 * Ghost reference-agent binary. Structure intentionally identical to
 * samantha-reference's main.ts; only the dispatch wiring differs.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { bootstrap } from '@kybernesis/arp-sidecar';
import { createResolver } from '@kybernesis/arp-resolver';
import { createRuntime } from '@kybernesis/arp-runtime';
import { createInMemoryKeyStore } from '@kybernesis/arp-transport';
import { createGhostDispatch } from './dispatch.js';
import { createFixtureKb, DEFAULT_FIXTURE } from './fixtures/knowledge-base.js';

const requireFromHere = createRequire(import.meta.url);

interface CliArgs {
  handoff: string | null;
  dataDir: string | null;
  port: number | null;
  host: string | null;
  adminToken: string | null;
  fixture: string | null;
  agentDescription: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    handoff: null,
    dataDir: null,
    port: null,
    host: null,
    adminToken: null,
    fixture: null,
    agentDescription: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = argv[i + 1];
    switch (a) {
      case '--handoff':
        args.handoff = next ?? null;
        i++;
        break;
      case '--data-dir':
        args.dataDir = next ?? null;
        i++;
        break;
      case '--port':
        args.port = Number(next);
        i++;
        break;
      case '--host':
        args.host = next ?? null;
        i++;
        break;
      case '--admin-token':
        args.adminToken = next ?? null;
        i++;
        break;
      case '--kb':
        args.fixture = next ?? null;
        i++;
        break;
      case '--description':
        args.agentDescription = next ?? null;
        i++;
        break;
      default:
        break;
    }
  }
  return args;
}

function originOf(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

function deriveName(did: string): string {
  const host = did.split(':')[2] ?? 'agent';
  const first = host.split('.')[0] ?? 'agent';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const handoffPath = args.handoff ?? process.env.ARP_HANDOFF ?? '/config/handoff.json';
  const dataDir = args.dataDir ?? process.env.ARP_DATA_DIR ?? '/data';
  const port = args.port ?? (process.env.ARP_PORT ? Number(process.env.ARP_PORT) : 443);
  const host = args.host ?? process.env.ARP_HOST ?? '0.0.0.0';
  const adminToken = args.adminToken ?? process.env.ARP_ADMIN_TOKEN ?? undefined;

  const fixture = args.fixture
    ? (JSON.parse(readFileSync(args.fixture, 'utf8')) as Parameters<typeof createFixtureKb>[0])
    : DEFAULT_FIXTURE;
  const kb = createFixtureKb(fixture);

  const boot = await bootstrap({ handoffPath, dataDir });
  const origin = originOf(boot.handoff.well_known_urls.arp);
  const agentDid = boot.handoff.agent_did;
  const resolver = createResolver();
  const keyStore = createInMemoryKeyStore(agentDid, boot.privateKey);

  const cedarSchemaJson = readFileSync(
    requireFromHere.resolve('@kybernesis/arp-spec/cedar-schema.json'),
    'utf8',
  );

  const runtime = await createRuntime({
    config: {
      did: agentDid,
      principalDid: boot.handoff.principal_did,
      publicKeyMultibase: boot.publicKeyMultibase,
      agentName: deriveName(agentDid),
      agentDescription: args.agentDescription ?? 'Ghost — ARP reference counterparty',
      wellKnownUrls: {
        didcomm: `${origin}/didcomm`,
        agentCard: boot.handoff.well_known_urls.agent_card,
        arpJson: boot.handoff.well_known_urls.arp,
      },
      representationVcUrl: `${origin}/.well-known/representation.jwt`,
      scopeCatalogVersion: 'v1',
      tlsFingerprint: boot.tlsFingerprint,
    },
    keyStore,
    resolver,
    cedarSchemaJson,
    registryPath: join(dataDir, 'registry.sqlite'),
    auditDir: join(dataDir, 'audit'),
    mailboxPath: join(dataDir, 'mailbox.sqlite'),
    ...(adminToken ? { adminToken } : {}),
    dispatch: createGhostDispatch({ knowledgeBase: kb }),
  });

  const info = await runtime.start(port, host);
  // eslint-disable-next-line no-console
  console.error(
    `[ghost-reference] runtime listening on ${info.hostname}:${info.port} (KB: ${
      Object.keys(fixture).length
    } connections prewired)`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.error(`[ghost-reference] ${signal} received — draining`);
    try {
      await runtime.stop({ graceMs: 5000 });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ghost-reference] graceful stop failed:', err);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[ghost-reference] fatal:', err);
  process.exit(1);
});
