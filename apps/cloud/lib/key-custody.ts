/**
 * Cloud key custody + identity minting (AgentID slice S2, task T3).
 *
 * Two responsibilities:
 *
 * 1. `sealPrivateKey` / `openPrivateKey` — AES-256-GCM envelope for an agent's
 *    Ed25519 seed when ARP Cloud holds it (`agents.key_custody = 'cloud'`).
 *    Wire format `v1:<iv>:<tag>:<ct>` (base64url parts) — the same shape the
 *    Kybernesis control plane uses for sealed connector credentials.
 *    The sealing key comes from `ARP_CLOUD_KEY_ENCRYPTION_KEY` (32 bytes,
 *    base64/base64url/hex). On production deployments an unset key throws;
 *    elsewhere a deterministic dev key is derived so local flows need no setup.
 *
 * 2. `mintIdentity` — creates the `agents` row for a `.agent` name: keypair,
 *    DID document, agent card, arp.json, handoff descriptor. Used by the
 *    purchase-fulfilment path (cloud custody, no runtime yet) and by the
 *    legacy provision-cloud route (exported custody, WS bridge runtime).
 *
 * The private key never leaves this module unsealed except through the
 * explicit return value of `mintIdentity` (so provision-cloud can hand it to
 * the owner once) and `openPrivateKey` (S4 push-mode signing).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import * as ed25519 from '@noble/ed25519';
import type { AgentRow, TenantDb } from '@kybernesis/arp-cloud-db';
import { buildA2aAgentCard, buildAgentCard, buildArpJson, buildDidDocument } from '@kybernesis/arp-templates';
import { base64urlEncode, ed25519RawToMultibase, signAgentCard } from '@kybernesis/arp-transport';

// ------------------------------------------------------------------ sealing

const SEAL_VERSION = 'v1';
const IV_BYTES = 12;

function decodeKeyMaterial(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return Uint8Array.from(Buffer.from(trimmed, 'hex'));
  try {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === 32) return Uint8Array.from(buf);
  } catch {
    /* fall through */
  }
  try {
    const buf = Buffer.from(trimmed, 'base64url');
    if (buf.length === 32) return Uint8Array.from(buf);
  } catch {
    /* fall through */
  }
  return null;
}

let cachedKey: Uint8Array | null = null;

/**
 * Resolve the sealing key. Fails closed on production when unset; otherwise
 * derives a stable dev key so PGlite-backed local runs and tests work.
 */
export function sealingKey(env: {
  ARP_CLOUD_KEY_ENCRYPTION_KEY: string | null;
  vercelEnv?: string | undefined;
}): Uint8Array {
  if (cachedKey) return cachedKey;
  const configured = env.ARP_CLOUD_KEY_ENCRYPTION_KEY;
  if (configured) {
    const key = decodeKeyMaterial(configured);
    if (!key) {
      throw new Error('ARP_CLOUD_KEY_ENCRYPTION_KEY must be 32 bytes (hex or base64)');
    }
    cachedKey = key;
    return key;
  }
  const vercelEnv = env.vercelEnv ?? process.env['VERCEL_ENV'];
  if (vercelEnv === 'production') {
    throw new Error(
      'ARP_CLOUD_KEY_ENCRYPTION_KEY must be set on production deployments (refusing to seal agent keys with a dev key)',
    );
  }
  cachedKey = Uint8Array.from(createHash('sha256').update('arp-cloud-dev-sealing-key').digest());
  return cachedKey;
}

export function resetSealingKeyForTests(): void {
  cachedKey = null;
}

export function sealPrivateKey(raw: Uint8Array, key: Uint8Array): string {
  if (raw.length !== 32) throw new Error('sealPrivateKey: expected a 32-byte Ed25519 seed');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(raw), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SEAL_VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join(':');
}

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

// ------------------------------------------------------------------ minting

export interface MintIdentityInput {
  tenantDb: TenantDb;
  /** `<sld>.agent` (lowercased by the caller or here). */
  domain: string;
  principalDid: string;
  agentName: string;
  agentDescription?: string;
  /** Where the sealed seed lives. `cloud` seals it into the row; `exported` stores nothing. */
  custody: 'cloud' | 'exported';
  runtimeKind: 'none' | 'bridge' | 'push';
  domainRegistrationId?: string | null;
  /**
   * Origin that serves this identity's well-known documents and endpoints.
   * Cloud-custody identities use the ICANN mirror (`https://<sld>.agent.arp.run`);
   * bridge agents keep the gateway host.
   */
  wellKnownOrigin: string;
  /** Extra `alsoKnownAs` URIs (the mirror origin is added automatically when it differs from wellKnownOrigin). */
  alsoKnownAs?: readonly string[];
  /** Mirror origin to advertise; null = none. */
  mirrorOrigin?: string | null;
  /** WebSocket URL handed to bridge runtimes. */
  gatewayWsUrl?: string | null;
  /** Sealing key (only read when custody = 'cloud'). */
  sealKey?: Uint8Array;
  /** Replace an existing row for this DID (re-provision / key rotation). */
  force?: boolean;
}

export interface MintedIdentity {
  agentDid: string;
  row: AgentRow;
  publicKeyMultibase: string;
  /** Raw 32-byte seed. Only returned so exported-custody callers can hand it off once. */
  privateKeyRaw: Uint8Array;
  handoff: Record<string, unknown>;
  wellKnownUrls: { did: string; agent_card: string; arp: string };
}

export class IdentityExistsError extends Error {
  readonly agentDid: string;
  constructor(agentDid: string) {
    super(`identity already exists for ${agentDid}`);
    this.name = 'IdentityExistsError';
    this.agentDid = agentDid;
  }
}

export async function mintIdentity(input: MintIdentityInput): Promise<MintedIdentity> {
  const domain = input.domain.toLowerCase();
  const agentDid = `did:web:${domain}`;
  const origin = input.wellKnownOrigin.replace(/\/+$/, '');

  const existing = await input.tenantDb.getAgent(agentDid);
  if (existing) {
    if (!input.force) throw new IdentityExistsError(agentDid);
    await input.tenantDb.deleteAgent(agentDid);
  }

  const privateKeyRaw = ed25519.utils.randomPrivateKey();
  const publicKeyRaw = await ed25519.getPublicKeyAsync(privateKeyRaw);
  const publicKeyMultibase = ed25519RawToMultibase(publicKeyRaw);

  const wellKnownUrls = {
    did: `${origin}/.well-known/did.json`,
    agent_card: `${origin}/.well-known/agent-card.json`,
    arp: `${origin}/.well-known/arp.json`,
  };

  const aka = new Set<string>(input.alsoKnownAs ?? []);
  if (input.mirrorOrigin && input.mirrorOrigin.replace(/\/+$/, '') !== origin) {
    aka.add(input.mirrorOrigin.replace(/\/+$/, ''));
  }

  const didDoc = buildDidDocument({
    agentDid,
    controllerDid: input.principalDid,
    publicKeyMultibase,
    endpoints: { didcomm: `${origin}/didcomm`, agentCard: wellKnownUrls.agent_card },
    representationVcUrl: `${origin}/representation.jwt`,
    ...(aka.size > 0 ? { alsoKnownAs: [...aka] } : {}),
  });
  const agentCard = buildAgentCard({
    name: input.agentName,
    did: agentDid,
    description: input.agentDescription ?? 'Personal agent',
    endpoints: { didcomm: `${origin}/didcomm`, pairing: `${origin}/pairing` },
    agentOrigin: origin,
  });
  const arpJson = buildArpJson({ agentOrigin: origin });
  const a2aCard = await buildSignedA2aCard({
    did: agentDid,
    name: input.agentName,
    description: input.agentDescription ?? 'Personal agent',
    origin,
    privateKeyRaw,
  });

  const handoff: Record<string, unknown> = {
    agent_did: agentDid,
    principal_did: input.principalDid,
    public_key_multibase: publicKeyMultibase,
    well_known_urls: wellKnownUrls,
    dns_records_published: ['_principal TXT'],
    cert_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    bootstrap_token: base64urlEncode(randomBytes(32)),
    key_custody: input.custody,
    runtime_kind: input.runtimeKind,
    ...(input.mirrorOrigin ? { mirror_origin: input.mirrorOrigin } : {}),
    ...(input.gatewayWsUrl ? { gateway_ws_url: input.gatewayWsUrl } : {}),
  };

  const sealed =
    input.custody === 'cloud'
      ? sealPrivateKey(
          privateKeyRaw,
          input.sealKey ?? sealingKey({ ARP_CLOUD_KEY_ENCRYPTION_KEY: null }),
        )
      : null;

  const row = await input.tenantDb.createAgent({
    did: agentDid,
    principalDid: input.principalDid,
    agentName: input.agentName,
    agentDescription: input.agentDescription ?? '',
    publicKeyMultibase,
    handoffJson: handoff,
    wellKnownDid: didDoc as Record<string, unknown>,
    wellKnownAgentCard: agentCard as Record<string, unknown>,
    wellKnownArp: arpJson as Record<string, unknown>,
    scopeCatalogVersion: 'v1',
    tlsFingerprint: 'cloud-hosted',
    keyCustody: input.custody,
    privateKeyEnc: sealed,
    runtimeKind: input.runtimeKind,
    domainRegistrationId: input.domainRegistrationId ?? null,
    wellKnownA2aCard: a2aCard,
  });

  return { agentDid, row, publicKeyMultibase, privateKeyRaw, handoff, wellKnownUrls };
}

/**
 * AgentID S5: build the A2A v1.0 card for an identity and sign it with the
 * identity's own Ed25519 key when the seed is available (unsigned otherwise —
 * exported-custody identities re-sign via arpc in S5b).
 */
export async function buildSignedA2aCard(input: {
  did: string;
  name: string;
  description: string;
  origin: string;
  privateKeyRaw?: Uint8Array | null;
  scopes?: readonly string[];
  provider?: { organization: string; url?: string };
}): Promise<Record<string, unknown>> {
  const origin = input.origin.replace(/\/+$/, '');
  const sld = input.did.replace(/^did:web:/, '').replace(/\.agent$/, '');
  const card = buildA2aAgentCard({
    name: input.name,
    description: input.description,
    did: input.did,
    origin,
    pairUrl: `https://cloud.arp.run/pair?peer=${encodeURIComponent(input.did)}`,
    provider: input.provider ?? { organization: sld, url: `https://agent.arp.run/${sld}` },
    ...(input.scopes ? { scopes: input.scopes } : {}),
  }) as Record<string, unknown>;
  if (!input.privateKeyRaw) return card;
  const sig = await signAgentCard(card, {
    privateKey: input.privateKeyRaw,
    kid: `${input.did}#key-1`,
    jku: `${origin}/.well-known/jwks.json`,
  });
  return { ...card, signatures: [sig] };
}

/** `https://<sld><suffix>` — the ICANN mirror origin for a `.agent` name. */
export function mirrorOriginFor(domain: string, suffix: string): string {
  const sld = domain.toLowerCase().replace(/\.agent$/, '');
  return `https://${sld}${suffix.startsWith('.') ? suffix : `.${suffix}`}`;
}

/**
 * Flip a cloud-custody identity to exported: returns the raw seed once and
 * wipes it from the row. Callers must hand the key to the owner immediately.
 */
export async function exportPrivateKey(input: {
  tenantDb: TenantDb;
  agentDid: string;
  sealKey: Uint8Array;
}): Promise<Uint8Array> {
  const row = await input.tenantDb.getAgent(input.agentDid);
  if (!row) throw new Error(`no identity for ${input.agentDid}`);
  if (row.keyCustody !== 'cloud' || !row.privateKeyEnc) {
    throw new Error(`identity ${input.agentDid} is not in cloud custody`);
  }
  const raw = openPrivateKey(row.privateKeyEnc, input.sealKey);
  await input.tenantDb.updateAgent(input.agentDid, { keyCustody: 'exported', privateKeyEnc: null });
  return raw;
}
