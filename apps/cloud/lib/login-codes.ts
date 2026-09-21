/**
 * One-time email codes (owner account, S6d).
 *
 * A code is 6 digits, hashed at rest, valid 10 minutes, single use, and
 * locked after 5 wrong tries. `sign_in` codes are only issued for an address
 * that belongs to a tenant (the response never reveals whether it does);
 * `verify_email` codes bind a new address to the signed-in tenant.
 */

import { createHash, randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { loginCodes, tenants, type CloudDbClient, type LoginCodePurpose } from '@kybernesis/arp-cloud-db';
import { codeEmail, sendEmail } from '@/lib/email';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  return EMAIL_RE.test(e) && e.length <= 254 ? e : null;
}

function hashCode(email: string, code: string): string {
  return createHash('sha256').update(`${email}\n${code}`, 'utf8').digest('hex');
}

export async function tenantIdForEmail(db: CloudDbClient, email: string): Promise<string | null> {
  const rows = await db.select({ id: tenants.id }).from(tenants).where(sql`lower(${tenants.email}) = ${email}`).limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Issue a code and email it. For `sign_in`, silently does nothing when the
 * address is unknown (callers still answer "if that address has an account,
 * a code is on its way"). Returns whether a message was actually sent.
 */
export async function issueCode(db: CloudDbClient, input: { email: string; purpose: LoginCodePurpose; tenantId?: string | null }, deps: { fetchImpl?: typeof fetch; codeOverride?: string } = {}): Promise<{ sent: boolean }> {
  let tenantId = input.tenantId ?? null;
  if (input.purpose === 'sign_in') {
    tenantId = await tenantIdForEmail(db, input.email);
    if (!tenantId) return { sent: false };
  }
  const code = deps.codeOverride ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
  // One live code per address + purpose: retire earlier ones.
  await db.update(loginCodes).set({ consumedAt: new Date() }).where(and(eq(loginCodes.email, input.email), eq(loginCodes.purpose, input.purpose), isNull(loginCodes.consumedAt)));
  await db.insert(loginCodes).values({ email: input.email, codeHash: hashCode(input.email, code), purpose: input.purpose, tenantId, expiresAt: new Date(Date.now() + CODE_TTL_MS) });
  const msg = codeEmail(code, input.purpose);
  await sendEmail({ to: input.email, ...msg }, deps.fetchImpl);
  return { sent: true };
}

export type RedeemResult = { ok: true; tenantId: string | null } | { ok: false; reason: 'invalid' | 'expired' | 'locked' };

/** Check a code; consumes it on success, counts a failed try otherwise. */
export async function redeemCode(db: CloudDbClient, input: { email: string; code: string; purpose: LoginCodePurpose }): Promise<RedeemResult> {
  const rows = await db
    .select()
    .from(loginCodes)
    .where(and(eq(loginCodes.email, input.email), eq(loginCodes.purpose, input.purpose), isNull(loginCodes.consumedAt)))
    .orderBy(desc(loginCodes.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' };
  const digits = input.code.replace(/\D/g, '');
  if (digits.length !== 6 || hashCode(input.email, digits) !== row.codeHash) {
    await db.update(loginCodes).set({ attempts: row.attempts + 1 }).where(eq(loginCodes.id, row.id));
    return { ok: false, reason: row.attempts + 1 >= MAX_ATTEMPTS ? 'locked' : 'invalid' };
  }
  const consumed = await db
    .update(loginCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(loginCodes.id, row.id), isNull(loginCodes.consumedAt), gt(loginCodes.expiresAt, new Date())))
    .returning({ id: loginCodes.id });
  if (consumed.length === 0) return { ok: false, reason: 'invalid' };
  return { ok: true, tenantId: row.tenantId };
}
