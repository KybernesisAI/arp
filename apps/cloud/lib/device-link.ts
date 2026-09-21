/**
 * Device links (S6d): hand the account key from a device that has it to a
 * device that is signed in without it, through the server but never in
 * clear. See migration 0019. Crypto lives in `lib/device-link-crypto.ts`
 * (runs in both browsers); this file is the server-side ledger.
 */

import { createHash, randomInt } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { deviceLinks, type CloudDbClient } from '@kybernesis/arp-cloud-db';

export const LINK_TTL_MS = 10 * 60 * 1000;
export const MAX_CLAIM_ATTEMPTS = 5;

function hashCode(tenantId: string, code: string): string {
  return createHash('sha256').update(`${tenantId}\n${code}`, 'utf8').digest('hex');
}

/** New device: register its ephemeral public key; get a code to read out. */
export async function startLink(db: CloudDbClient, tenantId: string, receiverPub: string, codeOverride?: string): Promise<{ id: string; code: string; expiresAt: Date }> {
  const code = codeOverride ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  const rows = await db.insert(deviceLinks).values({ tenantId, codeHash: hashCode(tenantId, code), receiverPub, expiresAt }).returning({ id: deviceLinks.id });
  return { id: rows[0]!.id, code, expiresAt };
}

export type ClaimResult = { ok: true; id: string; receiverPub: string } | { ok: false; reason: 'invalid' | 'expired' | 'locked' };

/** Device with the key: turn the code into the receiver's public key. Counts wrong tries per open link. */
export async function claimLink(db: CloudDbClient, tenantId: string, code: string): Promise<ClaimResult> {
  const digits = code.replace(/\D/g, '');
  const open = await db.select().from(deviceLinks).where(and(eq(deviceLinks.tenantId, tenantId), isNull(deviceLinks.deliveredAt), isNull(deviceLinks.consumedAt))).orderBy(deviceLinks.createdAt);
  const live = open.filter((r) => r.expiresAt.getTime() > Date.now());
  if (live.length === 0) return { ok: false, reason: open.length > 0 ? 'expired' : 'invalid' };
  const hit = digits.length === 6 ? live.find((r) => r.codeHash === hashCode(tenantId, digits)) : undefined;
  if (hit) {
    if (hit.attempts >= MAX_CLAIM_ATTEMPTS) return { ok: false, reason: 'locked' };
    return { ok: true, id: hit.id, receiverPub: hit.receiverPub };
  }
  // Wrong code: charge every live link so guessing cannot continue indefinitely.
  for (const r of live) await db.update(deviceLinks).set({ attempts: r.attempts + 1 }).where(eq(deviceLinks.id, r.id));
  return { ok: false, reason: live.every((r) => r.attempts + 1 >= MAX_CLAIM_ATTEMPTS) ? 'locked' : 'invalid' };
}

/** Device with the key: store the key encrypted to the receiver. */
export async function deliverLink(db: CloudDbClient, tenantId: string, id: string, payload: { ciphertext: string; iv: string; senderPub: string }): Promise<boolean> {
  const rows = await db
    .update(deviceLinks)
    .set({ ciphertext: payload.ciphertext, iv: payload.iv, senderPub: payload.senderPub, deliveredAt: new Date() })
    .where(and(eq(deviceLinks.id, id), eq(deviceLinks.tenantId, tenantId), isNull(deviceLinks.deliveredAt), isNull(deviceLinks.consumedAt), gt(deviceLinks.expiresAt, new Date())))
    .returning({ id: deviceLinks.id });
  return rows.length === 1;
}

export type PollResult = { status: 'waiting' } | { status: 'expired' } | { status: 'delivered'; ciphertext: string; iv: string; senderPub: string };

/** New device: poll; the ciphertext is handed out once, then the link is spent. */
export async function pollLink(db: CloudDbClient, tenantId: string, id: string): Promise<PollResult> {
  const rows = await db.select().from(deviceLinks).where(and(eq(deviceLinks.id, id), eq(deviceLinks.tenantId, tenantId))).limit(1);
  const row = rows[0];
  if (!row || row.consumedAt) return { status: 'expired' };
  if (row.expiresAt.getTime() <= Date.now()) return { status: 'expired' };
  if (!row.deliveredAt || !row.ciphertext || !row.iv || !row.senderPub) return { status: 'waiting' };
  const consumed = await db.update(deviceLinks).set({ consumedAt: new Date(), ciphertext: null }).where(and(eq(deviceLinks.id, id), isNull(deviceLinks.consumedAt))).returning({ id: deviceLinks.id });
  if (consumed.length === 0) return { status: 'expired' };
  return { status: 'delivered', ciphertext: row.ciphertext, iv: row.iv, senderPub: row.senderPub };
}
