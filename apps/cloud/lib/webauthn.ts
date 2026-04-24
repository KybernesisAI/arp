/**
 * WebAuthn helpers — thin wrappers around @simplewebauthn/server bound to our
 * DB-backed challenge store + env configuration.
 *
 * Phase 9d: the passkey is the *authenticator*, not the identity. The
 * principal DID stays `did:key:...`; this module persists passkey credentials
 * + counters so a subsequent sign-in can issue a session cookie bound to the
 * same tenant without the browser-held private key participating.
 */

import { and, eq, lt, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { userCredentials, webauthnChallenges } from '@kybernesis/arp-cloud-db';
import type { UserCredentialRow } from '@kybernesis/arp-cloud-db';
import { getDb } from './db';
import { env } from './env';

export type ChallengePurpose = 'register' | 'auth';

const CHALLENGE_TTL_MS = 60_000;

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function webauthnConfig(): { rpId: string; rpName: string; origins: string[] } {
  const e = env();
  return {
    rpId: e.WEBAUTHN_RP_ID,
    rpName: e.WEBAUTHN_RP_NAME,
    origins: e.WEBAUTHN_ORIGINS,
  };
}

/**
 * Persist a challenge produced by the SimpleWebAuthn options generator. We
 * store what the authenticator will sign over, so the verify step can look
 * up by the exact string that appears in clientDataJSON without any further
 * encoding.
 */
export async function persistChallenge(
  challenge: string,
  purpose: ChallengePurpose,
  tenantId: string | null,
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.insert(webauthnChallenges).values({
    challenge,
    purpose,
    tenantId,
    expiresAt: new Date(now + CHALLENGE_TTL_MS),
  });

  // Opportunistic cleanup — ~1/100 requests sweep expired challenge rows.
  if (Math.random() < 0.01) {
    void db
      .delete(webauthnChallenges)
      .where(lt(webauthnChallenges.expiresAt, new Date(now - CHALLENGE_TTL_MS)))
      .catch(() => {
        // Best-effort cleanup; failures must never affect the request path.
      });
  }
}

/**
 * Produce a fresh random challenge as a 32-byte base64url string. The caller
 * should pass this into the SimpleWebAuthn options generator AND persist it
 * via {@link persistChallenge} so the verify step can consume it.
 *
 * Intentionally exported for tests + for callers that need to bind the
 * challenge to extra state (e.g. correlation id) before persistence.
 */
export function mintChallenge(): string {
  return toBase64Url(randomBytes(32));
}

/**
 * Consume a challenge atomically: returns the row if the challenge exists,
 * matches the requested purpose, has not expired, and has not previously
 * been consumed. Marks it consumed in the same transaction so a replay
 * returns null.
 */
export async function consumeChallenge(
  challenge: string,
  purpose: ChallengePurpose,
): Promise<{ tenantId: string | null } | null> {
  const db = await getDb();
  const now = new Date();
  // Atomic mark-as-consumed via UPDATE … WHERE consumed_at IS NULL RETURNING.
  // If two requests race, only one UPDATE matches; the other returns zero
  // rows and is rejected.
  const rows = await db
    .update(webauthnChallenges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(webauthnChallenges.challenge, challenge),
        eq(webauthnChallenges.purpose, purpose),
        sql`${webauthnChallenges.consumedAt} IS NULL`,
        sql`${webauthnChallenges.expiresAt} > ${now}`,
      ),
    )
    .returning({ tenantId: webauthnChallenges.tenantId });
  const row = rows[0];
  if (!row) return null;
  return { tenantId: row.tenantId };
}

export async function listCredentialsForTenant(
  tenantId: string,
): Promise<UserCredentialRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.tenantId, tenantId));
}

export async function findCredentialByCredentialId(
  credentialId: string,
): Promise<UserCredentialRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.credentialId, credentialId))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertCredential(input: {
  tenantId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  nickname: string | null;
}): Promise<UserCredentialRow> {
  const db = await getDb();
  const rows = await db
    .insert(userCredentials)
    .values({
      tenantId: input.tenantId,
      credentialId: input.credentialId,
      publicKey: input.publicKey,
      counter: input.counter,
      transports: input.transports,
      nickname: input.nickname,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('insertCredential returned no row');
  return row;
}

export async function bumpCredentialCounter(
  credentialId: string,
  counter: number,
): Promise<void> {
  const db = await getDb();
  await db
    .update(userCredentials)
    .set({ counter, lastUsedAt: new Date() })
    .where(eq(userCredentials.credentialId, credentialId));
}

/**
 * Rename a credential by DB row id. Tenant-scoped — updates ONLY if the
 * row's tenantId matches the caller's. Returns the updated row or null if
 * not found / not owned by the tenant.
 */
export async function renameCredentialForTenant(
  tenantId: string,
  id: string,
  nickname: string | null,
): Promise<UserCredentialRow | null> {
  const db = await getDb();
  const rows = await db
    .update(userCredentials)
    .set({ nickname })
    .where(and(eq(userCredentials.id, id), eq(userCredentials.tenantId, tenantId)))
    .returning();
  return rows[0] ?? null;
}

/**
 * Delete a credential by DB row id. Tenant-scoped — deletes ONLY if the
 * row's tenantId matches the caller's. Returns true if a row was removed.
 */
export async function deleteCredentialForTenant(
  tenantId: string,
  id: string,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .delete(userCredentials)
    .where(and(eq(userCredentials.id, id), eq(userCredentials.tenantId, tenantId)))
    .returning({ id: userCredentials.id });
  return rows.length > 0;
}

/**
 * Count credentials registered for a tenant. Used by the DELETE route to
 * refuse removing the last credential — see
 * apps/cloud/app/api/webauthn/credentials/[id]/route.ts.
 */
export async function countCredentialsForTenant(tenantId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.tenantId, tenantId));
  return rows.length;
}
