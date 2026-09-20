/**
 * Give a name to someone else (AgentID "gift a name").
 *
 * The giver creates a gift link for a name they hold. The link carries an
 * unguessable token in the URL fragment (never in server logs); only the
 * token's SHA-256 is stored. When the recipient accepts while signed in:
 *
 *   1. the registration row moves to the recipient's account,
 *   2. the giver's identity for the name is retired (agent row, links,
 *      credentials, connect tickets, owner proof),
 *   3. a fresh identity is minted for the recipient (new key, owner = them).
 *
 * The name stays on our registrar account the whole time, so nothing
 * upstream changes and there is no supplier round trip. This module is the
 * ONE place in apps/cloud that writes across tenants on purpose — every
 * query below is tenant-predicated on the giver or the recipient explicitly.
 */

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import {
  agentConnectTickets,
  agentCredentials,
  agentLinks,
  agents,
  domainRegistrations,
  nameGifts,
  registrarBindings,
  tenants,
  toTenantId,
  withTenant,
  type CloudDbClient,
  type NameGiftRow,
} from '@kybernesis/arp-cloud-db';
import { env } from '@/lib/env';
import { mintIdentity, mirrorOriginFor, sealingKey } from '@/lib/key-custody';

export const GIFT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const GIFTABLE_STATUSES = new Set(['active', 'registered', 'owner_pending']);

export type GiftState = 'pending' | 'claimed' | 'cancelled' | 'expired' | 'invalid';

export class GiftError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'GiftError';
    this.status = status;
    this.code = code;
  }
}

export function hashGiftToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function stateOf(row: NameGiftRow, now = Date.now()): GiftState {
  if (row.status === 'claimed') return 'claimed';
  if (row.status === 'cancelled') return 'cancelled';
  if (row.expiresAt.getTime() <= now) return 'expired';
  return 'pending';
}

export function giftUrl(baseUrl: string, token: string): string {
  // Fragment keeps the token out of access logs; the client reads it.
  return `${baseUrl.replace(/\/+$/, '')}/gift#${token}`;
}

/** The giver's pending gift for a name, if any. */
export async function pendingGiftFor(db: CloudDbClient, fromTenantId: string, domain: string): Promise<NameGiftRow | null> {
  const rows = await db
    .select()
    .from(nameGifts)
    .where(and(eq(nameGifts.fromTenantId, fromTenantId), eq(nameGifts.domain, domain), eq(nameGifts.status, 'pending'), gt(nameGifts.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

/** Create a gift link. Any earlier pending link for the same name is cancelled. */
export async function createGift(input: {
  db: CloudDbClient;
  fromTenantId: string;
  sld: string;
  message?: string | null;
  baseUrl: string;
}): Promise<{ row: NameGiftRow; url: string }> {
  const domain = `${input.sld}.agent`;
  const regs = await input.db
    .select({ id: domainRegistrations.id, status: domainRegistrations.status })
    .from(domainRegistrations)
    .where(and(eq(domainRegistrations.tenantId, input.fromTenantId), eq(domainRegistrations.domain, domain)))
    .limit(1);
  const reg = regs[0];
  if (!reg || !GIFTABLE_STATUSES.has(reg.status)) {
    throw new GiftError(403, 'not_owned', 'This name is not registered to your account.');
  }

  await input.db
    .update(nameGifts)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(and(eq(nameGifts.fromTenantId, input.fromTenantId), eq(nameGifts.domain, domain), eq(nameGifts.status, 'pending')));

  const token = randomBytes(24).toString('base64url');
  const rows = await input.db
    .insert(nameGifts)
    .values({
      registrationId: reg.id,
      domain,
      fromTenantId: input.fromTenantId,
      tokenHash: hashGiftToken(token),
      message: input.message?.trim() ? input.message.trim().slice(0, 280) : null,
      expiresAt: new Date(Date.now() + GIFT_TTL_MS),
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('createGift returned no row');
  return { row, url: giftUrl(input.baseUrl, token) };
}

/** Cancel the giver's pending link for a name. Returns whether one existed. */
export async function cancelGift(db: CloudDbClient, fromTenantId: string, sld: string): Promise<boolean> {
  const rows = await db
    .update(nameGifts)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(and(eq(nameGifts.fromTenantId, fromTenantId), eq(nameGifts.domain, `${sld}.agent`), eq(nameGifts.status, 'pending')))
    .returning({ id: nameGifts.id });
  return rows.length > 0;
}

export interface GiftPreview {
  state: GiftState;
  domain: string | null;
  sld: string | null;
  message: string | null;
  from: string | null;
  expiresAt: string | null;
}

/** What the recipient sees before accepting. Public: reveals only the name, the note and who it is from. */
export async function previewGift(db: CloudDbClient, token: string): Promise<GiftPreview> {
  const rows = await db.select().from(nameGifts).where(eq(nameGifts.tokenHash, hashGiftToken(token))).limit(1);
  const row = rows[0];
  if (!row) return { state: 'invalid', domain: null, sld: null, message: null, from: null, expiresAt: null };
  const giver = await db.select({ displayName: tenants.displayName }).from(tenants).where(eq(tenants.id, row.fromTenantId)).limit(1);
  return {
    state: stateOf(row),
    domain: row.domain,
    sld: row.domain.replace(/\.agent$/, ''),
    message: row.message,
    from: giver[0]?.displayName ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export interface ClaimResult {
  domain: string;
  sld: string;
  agentDid: string;
  /** `ready` = identity minted for the recipient; `pending` = registration moved, identity to be set up from the name's page. */
  identity: 'ready' | 'pending';
}

/** Accept a gift as the signed-in recipient. Single-use: the first successful claim wins. */
export async function claimGift(input: {
  db: CloudDbClient;
  token: string;
  toTenantId: string;
  toPrincipalDid: string;
}): Promise<ClaimResult> {
  const { db } = input;
  const tokenHash = hashGiftToken(input.token);
  const found = (await db.select().from(nameGifts).where(eq(nameGifts.tokenHash, tokenHash)).limit(1))[0];
  if (!found) throw new GiftError(404, 'invalid', 'This gift link is not valid.');
  const state = stateOf(found);
  if (state === 'claimed') throw new GiftError(409, 'claimed', 'This gift has already been accepted.');
  if (state === 'cancelled') throw new GiftError(410, 'cancelled', 'This gift was cancelled by the sender.');
  if (state === 'expired') throw new GiftError(410, 'expired', 'This gift link has expired.');
  if (found.fromTenantId === input.toTenantId) throw new GiftError(400, 'self', 'You already hold this name.');

  // Compare-and-set: whoever flips pending → claimed first owns the rest of the flow.
  const claimed = await db
    .update(nameGifts)
    .set({ status: 'claimed', toTenantId: input.toTenantId, claimedAt: new Date() })
    .where(and(eq(nameGifts.id, found.id), eq(nameGifts.status, 'pending'), gt(nameGifts.expiresAt, new Date())))
    .returning();
  if (claimed.length === 0) throw new GiftError(409, 'claimed', 'This gift has already been accepted.');

  const domain = found.domain;
  const sld = domain.replace(/\.agent$/, '');
  const agentDid = `did:web:${domain}`;
  const from = found.fromTenantId;

  // 1. Move the registration. The owner proof was the giver's, so it is cleared.
  const moved = await db
    .update(domainRegistrations)
    .set({ tenantId: input.toTenantId, ownerLabel: null, updatedAt: new Date() })
    .where(and(eq(domainRegistrations.id, found.registrationId), eq(domainRegistrations.tenantId, from)))
    .returning({ id: domainRegistrations.id });
  if (moved.length === 0) {
    // The giver no longer holds it (already gifted elsewhere, or expired out). Undo the claim mark.
    await db.update(nameGifts).set({ status: 'cancelled', toTenantId: null, claimedAt: null, cancelledAt: new Date() }).where(eq(nameGifts.id, found.id));
    throw new GiftError(410, 'gone', 'The sender no longer holds this name.');
  }

  // 2. Retire the giver's identity for the name. agents.did is global, so the row
  //    must go before the recipient's can exist.
  const previous = (await db.select({ agentName: agents.agentName, agentDescription: agents.agentDescription, avatarData: agents.avatarData, avatarMime: agents.avatarMime, accent: agents.accent }).from(agents).where(and(eq(agents.did, agentDid), eq(agents.tenantId, from))).limit(1))[0];
  await db.delete(agentLinks).where(and(eq(agentLinks.agentDid, agentDid), eq(agentLinks.tenantId, from)));
  await db.delete(agentCredentials).where(and(eq(agentCredentials.agentDid, agentDid), eq(agentCredentials.tenantId, from)));
  await db.delete(agentConnectTickets).where(and(eq(agentConnectTickets.agentDid, agentDid), eq(agentConnectTickets.tenantId, from)));
  await db.delete(registrarBindings).where(and(eq(registrarBindings.domain, domain), eq(registrarBindings.tenantId, from)));
  await db.delete(agents).where(and(eq(agents.did, agentDid), eq(agents.tenantId, from)));

  // 3. Mint the recipient's identity. If this fails the registration has still
  //    moved; the name's page offers "Set up identity" to finish.
  const mirror = mirrorOriginFor(domain, env().AGENTID_MIRROR_SUFFIX);
  try {
    await mintIdentity({
      tenantDb: withTenant(db, toTenantId(input.toTenantId)),
      domain,
      principalDid: input.toPrincipalDid,
      agentName: previous?.agentName ?? sld,
      agentDescription: previous?.agentDescription ?? '',
      profile: { avatarData: previous?.avatarData ?? null, avatarMime: previous?.avatarMime ?? null, accent: previous?.accent ?? null },
      custody: 'cloud',
      runtimeKind: 'none',
      domainRegistrationId: found.registrationId,
      wellKnownOrigin: mirror,
      mirrorOrigin: mirror,
      sealKey: sealingKey({ ARP_CLOUD_KEY_ENCRYPTION_KEY: process.env['ARP_CLOUD_KEY_ENCRYPTION_KEY'] ?? null, vercelEnv: process.env['VERCEL_ENV'] }),
      force: true,
    });
    return { domain, sld, agentDid, identity: 'ready' };
  } catch (err) {
    console.error('[name-gifts] identity mint after claim failed', err);
    return { domain, sld, agentDid, identity: 'pending' };
  }
}
