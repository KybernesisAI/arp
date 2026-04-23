/**
 * Route-handler helper: derive the caller's TenantDb from the session.
 * Throws a typed error so handlers can render 401/403 consistently.
 *
 * CRITICAL: this is the ONLY place in apps/cloud that bridges session →
 * TenantDb. Every route that touches tenant data goes through here.
 */

import {
  toTenantId,
  withTenant,
  tenants as tenantsTable,
  type CloudDbClient,
  type TenantDb,
} from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import { getSession, type SessionPayload } from './session';
import { getDb } from './db';

export class AuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new AuthError(401, 'unauthorized');
  return session;
}

export async function requireTenantDb(): Promise<{ tenantDb: TenantDb; session: SessionPayload; db: CloudDbClient }> {
  const session = await requireSession();
  const db = await getDb();
  let tenantId = session.tenantId;
  if (!tenantId) {
    // Look up by principal_did — the tenant may have been created after the
    // initial challenge session but before any agent was provisioned.
    const rows = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.principalDid, session.principalDid))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AuthError(404, 'no_tenant');
    tenantId = row.id;
  }
  const tenantDb = withTenant(db, toTenantId(tenantId));
  return { tenantDb, session, db };
}

/** For Stripe-webhook / admin flows: resolve by tenantId explicitly. */
export async function tenantDbById(tenantId: string): Promise<TenantDb> {
  const db = await getDb();
  return withTenant(db, toTenantId(tenantId));
}
