/**
 * Identity links (AgentID slice S3, task L2).
 *
 * A `.agent` name is the root identity; other identities attach to it as
 * links with two-way proofs. This module owns:
 *
 *   - normalization of link values per kind (npub → hex, handles, origins)
 *   - challenge minting + the challenge string the other side must sign/serve
 *   - proof verification per kind:
 *       nostr      a signed nostr event whose content is the challenge string
 *       kybernesis an ES256 JWS from the control plane, verified via its JWKS
 *       runtime    GET <url>/.well-known/agentid-verification → { did, challenge }
 *       web        same document on the origin, or a <meta name="agentid"> tag
 *   - rebuildWellKnown(): regenerate the DID document (alsoKnownAs / service)
 *     from the verified links so the mirror always reflects current state
 *
 * Nothing here is customer-facing text; route handlers map codes to copy.
 */

import { createHash, randomBytes } from 'node:crypto';
import { schnorr } from '@noble/curves/secp256k1';
import { bech32 } from '@scure/base';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AgentLinkKind, AgentLinkRow, AgentRow, TenantDb } from '@kybernesis/arp-cloud-db';
import { buildDidDocument } from '@kybernesis/arp-templates';

// ------------------------------------------------------------------ errors

export type LinkErrorCode =
  | 'invalid_value'
  | 'unsupported_kind'
  | 'proof_missing'
  | 'proof_invalid'
  | 'proof_mismatch'
  | 'unreachable'
  | 'issuer_not_allowed';

export class LinkError extends Error {
  readonly code: LinkErrorCode;
  constructor(code: LinkErrorCode, message: string) {
    super(message);
    this.name = 'LinkError';
    this.code = code;
  }
}

// ------------------------------------------------------------------ values

const HEX64 = /^[0-9a-f]{64}$/;
const KYB_HANDLE = /^agent:[a-z0-9][a-z0-9-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** npub1… (NIP-19) or 64-hex → 64-hex. */
export function normalizeNostrPubkey(input: string): string {
  const v = input.trim();
  if (HEX64.test(v.toLowerCase())) return v.toLowerCase();
  if (v.toLowerCase().startsWith('npub1')) {
    try {
      const { prefix, words } = bech32.decode(v.toLowerCase() as `${string}1${string}`, 1000);
      if (prefix !== 'npub') throw new Error('not npub');
      const bytes = bech32.fromWords(words);
      if (bytes.length !== 32) throw new Error('bad length');
      return Buffer.from(bytes).toString('hex');
    } catch {
      throw new LinkError('invalid_value', 'That is not a valid npub.');
    }
  }
  throw new LinkError('invalid_value', 'Enter an npub or a 64-character hex public key.');
}

export function npubFromHex(hex: string): string {
  return bech32.encode('npub', bech32.toWords(Buffer.from(hex, 'hex')), 1000);
}

export function normalizeLinkValue(kind: AgentLinkKind, input: string): string {
  switch (kind) {
    case 'nostr':
      return normalizeNostrPubkey(input);
    case 'kybernesis': {
      const v = input.trim();
      if (!KYB_HANDLE.test(v)) {
        throw new LinkError('invalid_value', 'Use the form agent:<org>/<name>.');
      }
      return v;
    }
    case 'runtime':
    case 'web': {
      let url: URL;
      try {
        url = new URL(input.trim());
      } catch {
        throw new LinkError('invalid_value', 'Enter a full https:// URL.');
      }
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
        throw new LinkError('invalid_value', 'The URL must use https.');
      }
      url.hash = '';
      url.search = '';
      return kind === 'web' ? url.origin : url.toString().replace(/\/+$/, '');
    }
    default:
      throw new LinkError('unsupported_kind', `unsupported link kind ${String(kind)}`);
  }
}

// ------------------------------------------------------------------ challenge

export function makeChallenge(): string {
  return randomBytes(16).toString('base64url');
}

/** The exact string the other side must sign (nostr) or serve (runtime/web). */
export function challengeString(agentDid: string, challenge: string): string {
  return `agentid-link:${agentDid}:${challenge}`;
}

// ------------------------------------------------------------------ nostr proof

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

function nostrEventId(ev: Omit<NostrEvent, 'id' | 'sig'>): string {
  const serialized = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/** Structural + cryptographic check of a nostr event (NIP-01). */
export function verifyNostrEvent(ev: unknown): ev is NostrEvent {
  if (!ev || typeof ev !== 'object') return false;
  const e = ev as Record<string, unknown>;
  if (
    typeof e['id'] !== 'string' ||
    typeof e['pubkey'] !== 'string' ||
    typeof e['sig'] !== 'string' ||
    typeof e['content'] !== 'string' ||
    typeof e['kind'] !== 'number' ||
    typeof e['created_at'] !== 'number' ||
    !Array.isArray(e['tags'])
  ) {
    return false;
  }
  if (!HEX64.test(e['pubkey']) || !HEX64.test(e['id']) || !/^[0-9a-f]{128}$/.test(e['sig'])) return false;
  const expectedId = nostrEventId({
    pubkey: e['pubkey'],
    created_at: e['created_at'],
    kind: e['kind'],
    tags: e['tags'] as string[][],
    content: e['content'],
  });
  if (expectedId !== e['id']) return false;
  try {
    return schnorr.verify(e['sig'], e['id'], e['pubkey']);
  } catch {
    return false;
  }
}

export function verifyNostrLinkProof(link: Pick<AgentLinkRow, 'agentDid' | 'value' | 'challenge'>, proof: unknown): NostrEvent {
  if (proof === undefined || proof === null) throw new LinkError('proof_missing', 'Paste the signed event.');
  const ev = typeof proof === 'string' ? safeJson(proof) : proof;
  if (!verifyNostrEvent(ev)) throw new LinkError('proof_invalid', 'The signed event could not be verified.');
  if (ev.pubkey !== link.value) throw new LinkError('proof_mismatch', 'The event was signed by a different key.');
  if (ev.content.trim() !== challengeString(link.agentDid, link.challenge)) {
    throw new LinkError('proof_mismatch', 'The event does not contain this link’s challenge.');
  }
  return ev;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ kybernesis proof

export interface KybernesisProofOptions {
  /** Allowed control-plane issuers (origin). Default: the Kybernesis control plane. */
  allowedIssuers?: readonly string[];
  /** JWKS path relative to the issuer. */
  jwksPath?: string;
  /** Injected for tests: verify function returning the payload. */
  verifyImpl?: (jws: string, issuer: string) => Promise<Record<string, unknown>>;
}

export const DEFAULT_KYBERNESIS_ISSUERS = ['https://agent.kybernesis.ai'] as const;

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyKybernesisLinkProof(
  link: Pick<AgentLinkRow, 'agentDid' | 'value' | 'challenge'>,
  proof: unknown,
  opts: KybernesisProofOptions = {},
): Promise<Record<string, unknown>> {
  if (typeof proof !== 'string' || proof.split('.').length !== 3) {
    throw new LinkError('proof_missing', 'Paste the signed statement from the control plane.');
  }
  const allowed = opts.allowedIssuers ?? DEFAULT_KYBERNESIS_ISSUERS;
  let payloadUnverified: Record<string, unknown>;
  try {
    payloadUnverified = JSON.parse(Buffer.from(proof.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new LinkError('proof_invalid', 'The statement could not be read.');
  }
  const iss = typeof payloadUnverified['iss'] === 'string' ? (payloadUnverified['iss'] as string).replace(/\/+$/, '') : '';
  if (!allowed.includes(iss)) throw new LinkError('issuer_not_allowed', 'That control plane is not recognised.');

  let payload: Record<string, unknown>;
  try {
    if (opts.verifyImpl) {
      payload = await opts.verifyImpl(proof, iss);
    } else {
      let jwks = jwksCache.get(iss);
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(`${iss}${opts.jwksPath ?? '/api/jwks'}`));
        jwksCache.set(iss, jwks);
      }
      const { payload: p } = await jwtVerify(proof, jwks, { issuer: payloadUnverified['iss'] as string });
      payload = p as Record<string, unknown>;
    }
  } catch (err) {
    if (err instanceof LinkError) throw err;
    throw new LinkError('proof_invalid', 'The statement’s signature could not be verified.');
  }
  if (payload['sub'] !== link.value || payload['did'] !== link.agentDid || payload['challenge'] !== link.challenge) {
    throw new LinkError('proof_mismatch', 'The statement does not match this name and link.');
  }
  return payload;
}

// ------------------------------------------------------------------ runtime / web proof

export const VERIFICATION_PATH = '/.well-known/agentid-verification';

export async function verifyFetchedLinkProof(
  link: Pick<AgentLinkRow, 'agentDid' | 'value' | 'challenge' | 'kind'>,
  fetchImpl: typeof fetch = globalThis.fetch,
  timeoutMs = 8000,
): Promise<Record<string, unknown>> {
  const base = link.value.replace(/\/+$/, '');
  const url = `${base}${VERIFICATION_PATH}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { accept: 'application/json, text/html' } });
    if (res.ok) {
      const text = await res.text();
      const doc = safeJson(text) as Record<string, unknown> | null;
      if (doc && doc['did'] === link.agentDid && doc['challenge'] === link.challenge) {
        return { source: url, document: doc };
      }
    }
    if (link.kind === 'web') {
      // Fallback: <meta name="agentid" content="<did>:<challenge>"> on the root page.
      const root = await fetchImpl(`${base}/`, { signal: ctrl.signal, headers: { accept: 'text/html' } });
      if (root.ok) {
        const html = await root.text();
        const m = html.match(/<meta\s+name=["']agentid["']\s+content=["']([^"']+)["']/i);
        if (m && m[1] === `${link.agentDid}:${link.challenge}`) return { source: `${base}/`, meta: m[1] };
      }
    }
    throw new LinkError('proof_mismatch', 'The verification document was not found or did not match.');
  } catch (err) {
    if (err instanceof LinkError) throw err;
    throw new LinkError('unreachable', 'That address could not be reached.');
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ dispatch

export async function verifyLinkProof(
  link: AgentLinkRow,
  proof: unknown,
  deps: { fetchImpl?: typeof fetch; kybernesis?: KybernesisProofOptions } = {},
): Promise<Record<string, unknown>> {
  switch (link.kind) {
    case 'nostr':
      return { event: verifyNostrLinkProof(link, proof) };
    case 'kybernesis':
      return { claims: await verifyKybernesisLinkProof(link, proof, deps.kybernesis) };
    case 'runtime':
    case 'web':
      return verifyFetchedLinkProof(link, deps.fetchImpl);
    default:
      throw new LinkError('unsupported_kind', `unsupported link kind ${String(link.kind)}`);
  }
}

// ------------------------------------------------------------------ DID doc rebuild

/** The `alsoKnownAs` URI for a verified link. */
export function alsoKnownAsFor(link: Pick<AgentLinkRow, 'kind' | 'value'>): string | null {
  switch (link.kind) {
    case 'nostr':
      return `nostr:${npubFromHex(link.value)}`;
    case 'kybernesis':
      return `kybernesis:${link.value}`;
    case 'web':
      return link.value;
    case 'runtime':
      return null; // expressed as a service, not an alias
    default:
      return null;
  }
}

/**
 * Regenerate the agent's DID document from its current key + verified links.
 * The mirror origin and endpoints are recovered from the stored document so
 * an identity minted on either origin (mirror or gateway) keeps its shape.
 */
export async function rebuildWellKnown(tenantDb: TenantDb, agentDid: string): Promise<AgentRow | null> {
  const agent = await tenantDb.getAgent(agentDid);
  if (!agent) return null;
  const links = await tenantDb.listLinks(agentDid);
  const verified = links.filter((l) => l.status === 'verified');

  const current = agent.wellKnownDid as {
    service?: Array<{ id: string; type: string; serviceEndpoint: string }>;
    principal?: { representationVC?: string };
    alsoKnownAs?: string[];
  };
  const didcomm = current.service?.find((s) => s.type === 'DIDCommMessaging')?.serviceEndpoint;
  const agentCard = current.service?.find((s) => s.type === 'AgentCard')?.serviceEndpoint;
  const repUrl = current.principal?.representationVC;
  if (!didcomm || !agentCard || !repUrl) return agent;

  // Keep the mirror origin alias (any https alias that is not a link value).
  const linkValues = new Set(links.map((l) => l.value));
  const structural = (current.alsoKnownAs ?? []).filter(
    (a) => a.startsWith('https://') && !linkValues.has(a) && !a.startsWith('nostr:') && !a.startsWith('kybernesis:'),
  );
  const aka = new Set<string>(structural);
  for (const l of verified) {
    const v = alsoKnownAsFor(l);
    if (v) aka.add(v);
  }

  const doc = buildDidDocument({
    agentDid,
    controllerDid: agent.principalDid,
    publicKeyMultibase: agent.publicKeyMultibase,
    endpoints: { didcomm, agentCard },
    representationVcUrl: repUrl,
    ...(aka.size > 0 ? { alsoKnownAs: [...aka] } : {}),
  }) as Record<string, unknown>;

  // Runtime + control-plane links are services (not in the strict schema's
  // enum, so appended after validation as extension entries).
  const extraServices = verified
    .filter((l) => l.kind === 'runtime' || l.kind === 'kybernesis')
    .map((l) => ({
      id: `${agentDid}#${l.kind}-${l.id.slice(0, 8)}`,
      type: l.kind === 'runtime' ? 'AgentRuntime' : 'KybernesisControlPlane',
      serviceEndpoint: l.kind === 'runtime' ? l.value : `https://agent.kybernesis.ai/${l.value.replace(/^agent:/, '')}`,
    }));
  if (extraServices.length > 0) {
    doc['service'] = [...((doc['service'] as unknown[]) ?? []), ...extraServices];
  }

  await tenantDb.updateAgent(agentDid, { wellKnownDid: doc });
  return { ...agent, wellKnownDid: doc };
}
