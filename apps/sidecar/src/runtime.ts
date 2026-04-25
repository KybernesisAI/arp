import { join } from 'node:path';
import { createResolver } from '@kybernesis/arp-resolver';
import { resolveCedarSchema } from './cedar.js';
import {
  createRuntime,
  type Runtime,
  type RuntimeConfig,
} from '@kybernesis/arp-runtime';
import { createInMemoryKeyStore } from '@kybernesis/arp-transport';
import type { BootstrapResult } from './bootstrap.js';
import { log } from './log.js';

export interface StartOptions {
  /** Hostname to bind. Default 0.0.0.0 inside the container. */
  hostname?: string;
  /** Port to bind. Default 443. */
  port?: number;
  /** Agent-local data dir. */
  dataDir: string;
  /** Bootstrap result (from `bootstrap()`). */
  bootstrap: BootstrapResult;
  /** Scope catalog version pin. */
  scopeCatalogVersion?: string;
  /** Revocations proxy source URL (optional). */
  revocationsProxyUrl?: string;
  /** Shared secret gating the runtime's `/admin/*` surface. */
  adminToken?: string;
  /**
   * When set, the runtime's owner-app proxy forwards `/owner/*` and any
   * request whose Host matches `hostSuffixes` to `target`.
   */
  ownerApp?: { target: string; hostSuffixes?: string[] };
  /**
   * Phase-10-10d WebAuthn config — when set, the runtime serves the
   * `/admin/webauthn/*` and `/admin/identity/*` surface against a sidecar-
   * local SQLite store.
   */
  webauthn?: {
    rpId: string;
    rpName: string;
    origins: string[];
  };
}

export interface StartedRuntime {
  runtime: Runtime;
  port: number;
  hostname: string;
}

/**
 * Boot the Phase 2 runtime with the material prepared by `bootstrap()`.
 * Returns the running runtime handle so the CLI can register signal handlers
 * and drive graceful shutdown.
 */
export async function startSidecarRuntime(
  opts: StartOptions,
): Promise<StartedRuntime> {
  const { bootstrap, dataDir } = opts;
  const { handoff } = bootstrap;

  const runtimeConfig: RuntimeConfig = {
    did: handoff.agent_did,
    principalDid: handoff.principal_did,
    publicKeyMultibase: bootstrap.publicKeyMultibase,
    wellKnownUrls: {
      didcomm: `${originFromUrl(handoff.well_known_urls.arp)}/didcomm`,
      agentCard: handoff.well_known_urls.agent_card,
      arpJson: handoff.well_known_urls.arp,
    },
    representationVcUrl: `${originFromUrl(handoff.well_known_urls.arp)}/.well-known/representation.jwt`,
    scopeCatalogVersion: opts.scopeCatalogVersion ?? 'v1',
    agentName: deriveAgentName(handoff.agent_did),
    agentDescription: 'Personal agent',
    tlsFingerprint: bootstrap.tlsFingerprint,
  };

  const keyStore = createInMemoryKeyStore(handoff.agent_did, bootstrap.privateKey);
  const resolver = createResolver();
  const cedarSchemaJson = resolveCedarSchema();

  const runtime = await createRuntime({
    config: runtimeConfig,
    keyStore,
    resolver,
    cedarSchemaJson,
    registryPath: join(dataDir, 'registry.sqlite'),
    auditDir: join(dataDir, 'audit'),
    mailboxPath: join(dataDir, 'mailbox.sqlite'),
    ...(opts.revocationsProxyUrl
      ? { revocationsProxy: { sourceUrl: opts.revocationsProxyUrl } }
      : {}),
    ...(opts.adminToken ? { adminToken: opts.adminToken } : {}),
    ...(opts.ownerApp ? { ownerApp: opts.ownerApp } : {}),
    ...(opts.webauthn
      ? {
          webauthn: {
            storePath: join(dataDir, 'auth.sqlite'),
            rpId: opts.webauthn.rpId,
            rpName: opts.webauthn.rpName,
            origins: opts.webauthn.origins,
          },
        }
      : {}),
  });

  const hostname = opts.hostname ?? process.env.ARP_HOST ?? '0.0.0.0';
  const port = opts.port ?? (process.env.ARP_PORT ? Number(process.env.ARP_PORT) : 443);
  const info = await runtime.start(port, hostname);

  log().info(
    {
      did: handoff.agent_did,
      port: info.port,
      hostname: info.hostname,
      cert_fingerprint: bootstrap.tlsFingerprint,
      handoff_cert_expires_at: handoff.cert_expires_at,
    },
    'arp-sidecar listening',
  );

  return { runtime, port: info.port, hostname: info.hostname };
}

function originFromUrl(fullUrl: string): string {
  const u = new URL(fullUrl);
  return `${u.protocol}//${u.host}`;
}

function deriveAgentName(did: string): string {
  const parts = did.split(':');
  const host = parts[2];
  if (!host) return 'agent';
  const firstLabel = host.split('.')[0];
  if (!firstLabel) return 'agent';
  return firstLabel.charAt(0).toUpperCase() + firstLabel.slice(1);
}
