/**
 * Tenant-branded database wrapper.
 *
 * Exposes CRUD methods for every runtime table WHILE guaranteeing that every
 * query carries a tenant_id predicate. Construction is the only place a
 * tenant id enters the wrapper; every method below appends that predicate
 * automatically.
 *
 * CRITICAL: do not add a method that bypasses the `tenantId` where-clause.
 * The admin surface uses `withoutTenant()` which returns the raw drizzle
 * client — but that entry point is gated to the rare ops path
 * (stripe webhook, session login, cross-tenant audits by Kybernesis admins).
 *
 * The test `tests/tenant-isolation.test.ts` provisions 5 tenants and verifies
 * zero cross-tenant leakage for every public method on `TenantDb`.
 */

import { and, eq, sql, desc, asc, lt, or, isNull } from 'drizzle-orm';
import type {
  AgentRow,
  AuditEntryRow,
  ConnectionRow,
  MessageRow,
  PushRegistrationRow,
  RevocationRow,
  TenantRow,
  UsageCounterRow,
} from './schema.js';
import {
  agents,
  auditEntries,
  connections,
  messages,
  pushRegistrations,
  revocations,
  tenants,
  usageCounters,
} from './schema.js';
import type { AuditInsertInput, EnqueuedMessage, TenantId } from './types.js';
import type { CloudDbClient } from './db.js';

export interface TenantDb {
  readonly tenantId: TenantId;
  readonly raw: CloudDbClient;

  // ----- tenant --------------------------------------------------------
  getTenant(): Promise<TenantRow | null>;
  updateTenant(patch: Partial<TenantRow>): Promise<void>;

  // ----- agents --------------------------------------------------------
  listAgents(): Promise<AgentRow[]>;
  getAgent(did: string): Promise<AgentRow | null>;
  createAgent(input: Omit<AgentRow, 'tenantId' | 'createdAt' | 'lastSeenAt' | 'wsSessionId'> & {
    wsSessionId?: string | null;
    lastSeenAt?: Date | null;
  }): Promise<AgentRow>;
  updateAgent(
    did: string,
    patch: Partial<Pick<AgentRow, 'wsSessionId' | 'lastSeenAt' | 'wellKnownDid' | 'wellKnownAgentCard' | 'wellKnownArp'>>,
  ): Promise<void>;
  deleteAgent(did: string): Promise<void>;

  // ----- connections ---------------------------------------------------
  listConnections(filter?: { agentDid?: string; status?: string; includeExpired?: boolean }): Promise<ConnectionRow[]>;
  getConnection(connectionId: string): Promise<ConnectionRow | null>;
  createConnection(input: Omit<ConnectionRow, 'tenantId' | 'createdAt' | 'lastMessageAt' | 'status' | 'revokeReason'> & {
    status?: ConnectionRow['status'];
  }): Promise<ConnectionRow>;
  updateConnectionStatus(
    connectionId: string,
    status: 'active' | 'suspended' | 'revoked',
    reason?: string,
  ): Promise<void>;
  touchConnection(connectionId: string): Promise<void>;

  // ----- messages ------------------------------------------------------
  enqueueMessage(input: {
    agentDid: string;
    connectionId: string | null;
    direction: 'in' | 'out';
    msgId: string;
    msgType: string;
    envelopeJws: string;
    body: Record<string, unknown> | null;
    peerDid: string | null;
    expiresAt: Date;
  }): Promise<MessageRow>;
  markMessageDelivered(id: string): Promise<void>;
  markMessageFailed(id: string, reason: string): Promise<void>;
  claimQueuedMessages(agentDid: string, limit?: number): Promise<EnqueuedMessage[]>;
  expireOldMessages(now: Date): Promise<number>;
  listMessages(agentDid: string, opts?: { limit?: number; direction?: 'in' | 'out' }): Promise<MessageRow[]>;

  // ----- audit ---------------------------------------------------------
  appendAudit(agentDid: string, input: AuditInsertInput, hashes: { prevHash: string; selfHash: string; seq: number }): Promise<AuditEntryRow>;
  listAudit(agentDid: string, connectionId: string, opts?: { limit?: number; offset?: number }): Promise<AuditEntryRow[]>;
  latestAudit(agentDid: string, connectionId: string): Promise<AuditEntryRow | null>;
  countAudit(agentDid: string, connectionId: string): Promise<number>;
  listRecentActivity(limit?: number): Promise<AuditEntryRow[]>;

  // ----- dashboard aggregates -----------------------------------------
  getAgentActivitySummary(): Promise<
    Array<{
      agentDid: string;
      activeConnections: number;
      lastAuditAt: Date | null;
      lastAuditMsgId: string | null;
    }>
  >;

  // ----- revocations ---------------------------------------------------
  addRevocation(agentDid: string, kind: 'connection' | 'key', subjectId: string, reason?: string): Promise<void>;
  isRevoked(agentDid: string, kind: 'connection' | 'key', subjectId: string): Promise<boolean>;
  listRevocations(agentDid: string): Promise<RevocationRow[]>;

  // ----- usage / billing ----------------------------------------------
  incrementUsage(period: string, patch: { inbound?: number; outbound?: number }): Promise<UsageCounterRow>;
  getUsage(period: string): Promise<UsageCounterRow | null>;

  // ----- push registrations -------------------------------------------
  upsertPushRegistration(input: {
    deviceToken: string;
    platform: 'ios' | 'android';
    bundleId: string;
  }): Promise<PushRegistrationRow>;
  listPushRegistrations(): Promise<PushRegistrationRow[]>;
}

export function withTenant(client: CloudDbClient, tenantId: TenantId): TenantDb {
  const self: TenantDb = {
    tenantId,
    raw: client,

    // --- tenant
    async getTenant() {
      const rows = await client.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      return rows[0] ?? null;
    },
    async updateTenant(patch) {
      const setPatch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) setPatch[k] = v;
      }
      await client.update(tenants).set(setPatch).where(eq(tenants.id, tenantId));
    },

    // --- agents
    async listAgents() {
      return client.select().from(agents).where(eq(agents.tenantId, tenantId));
    },
    async getAgent(did) {
      const rows = await client
        .select()
        .from(agents)
        .where(and(eq(agents.did, did), eq(agents.tenantId, tenantId)))
        .limit(1);
      return rows[0] ?? null;
    },
    async createAgent(input) {
      const rows = await client
        .insert(agents)
        .values({ ...input, tenantId })
        .returning();
      const row = rows[0];
      if (!row) throw new Error('createAgent returned no row');
      return row;
    },
    async updateAgent(did, patch) {
      await client
        .update(agents)
        .set(patch)
        .where(and(eq(agents.did, did), eq(agents.tenantId, tenantId)));
    },
    async deleteAgent(did) {
      await client.delete(agents).where(and(eq(agents.did, did), eq(agents.tenantId, tenantId)));
    },

    // --- connections
    async listConnections(filter) {
      const clauses = [eq(connections.tenantId, tenantId)];
      if (filter?.agentDid) clauses.push(eq(connections.agentDid, filter.agentDid));
      if (filter?.status) clauses.push(eq(connections.status, filter.status));
      return client
        .select()
        .from(connections)
        .where(and(...clauses))
        .orderBy(desc(connections.createdAt));
    },
    async getConnection(connectionId) {
      const rows = await client
        .select()
        .from(connections)
        .where(and(eq(connections.connectionId, connectionId), eq(connections.tenantId, tenantId)))
        .limit(1);
      return rows[0] ?? null;
    },
    async createConnection(input) {
      const rows = await client
        .insert(connections)
        .values({ ...input, tenantId, status: input.status ?? 'active' })
        .returning();
      const row = rows[0];
      if (!row) throw new Error('createConnection returned no row');
      return row;
    },
    async updateConnectionStatus(connectionId, status, reason) {
      await client
        .update(connections)
        .set({ status, ...(reason !== undefined ? { revokeReason: reason } : {}) })
        .where(and(eq(connections.connectionId, connectionId), eq(connections.tenantId, tenantId)));
    },
    async touchConnection(connectionId) {
      await client
        .update(connections)
        .set({ lastMessageAt: new Date() })
        .where(and(eq(connections.connectionId, connectionId), eq(connections.tenantId, tenantId)));
    },

    // --- messages
    async enqueueMessage(input) {
      const rows = await client
        .insert(messages)
        .values({ ...input, tenantId })
        .returning();
      const row = rows[0];
      if (!row) throw new Error('enqueueMessage returned no row');
      return row;
    },
    async markMessageDelivered(id) {
      await client
        .update(messages)
        .set({ status: 'delivered', deliveredAt: new Date() })
        .where(and(eq(messages.id, id), eq(messages.tenantId, tenantId)));
    },
    async markMessageFailed(id, reason) {
      await client
        .update(messages)
        .set({ status: 'failed', failureReason: reason })
        .where(and(eq(messages.id, id), eq(messages.tenantId, tenantId)));
    },
    async claimQueuedMessages(agentDid, limit = 100) {
      const rows = await client
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, tenantId),
            eq(messages.agentDid, agentDid),
            eq(messages.status, 'queued'),
          ),
        )
        .orderBy(asc(messages.createdAt))
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        msgId: r.msgId,
        msgType: r.msgType,
        envelopeJws: r.envelopeJws,
        body: (r.body as Record<string, unknown> | null) ?? null,
        peerDid: r.peerDid,
        connectionId: r.connectionId,
        createdAtMs: r.createdAt.getTime(),
      }));
    },
    async expireOldMessages(now) {
      const result = await client
        .update(messages)
        .set({ status: 'expired' })
        .where(
          and(
            eq(messages.tenantId, tenantId),
            eq(messages.status, 'queued'),
            lt(messages.expiresAt, now),
          ),
        )
        .returning({ id: messages.id });
      return result.length;
    },
    async listMessages(agentDid, opts) {
      const clauses = [eq(messages.tenantId, tenantId), eq(messages.agentDid, agentDid)];
      if (opts?.direction) clauses.push(eq(messages.direction, opts.direction));
      return client
        .select()
        .from(messages)
        .where(and(...clauses))
        .orderBy(desc(messages.createdAt))
        .limit(opts?.limit ?? 100);
    },

    // --- audit
    async appendAudit(agentDid, input, hashes) {
      const rows = await client
        .insert(auditEntries)
        .values({
          tenantId,
          agentDid,
          connectionId: input.connectionId,
          seq: hashes.seq,
          msgId: input.msgId,
          timestamp: new Date(input.timestamp),
          decision: input.decision,
          obligations: input.obligations,
          policiesFired: input.policiesFired,
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
          spendDeltaCents: input.spendDeltaCents ?? 0,
          prevHash: hashes.prevHash,
          selfHash: hashes.selfHash,
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error('appendAudit returned no row');
      return row;
    },
    async listAudit(agentDid, connectionId, opts) {
      return client
        .select()
        .from(auditEntries)
        .where(
          and(
            eq(auditEntries.tenantId, tenantId),
            eq(auditEntries.agentDid, agentDid),
            eq(auditEntries.connectionId, connectionId),
          ),
        )
        .orderBy(desc(auditEntries.seq))
        .limit(opts?.limit ?? 50)
        .offset(opts?.offset ?? 0);
    },
    async latestAudit(agentDid, connectionId) {
      const rows = await client
        .select()
        .from(auditEntries)
        .where(
          and(
            eq(auditEntries.tenantId, tenantId),
            eq(auditEntries.agentDid, agentDid),
            eq(auditEntries.connectionId, connectionId),
          ),
        )
        .orderBy(desc(auditEntries.seq))
        .limit(1);
      return rows[0] ?? null;
    },
    async countAudit(agentDid, connectionId) {
      const rows = await client
        .select({ count: sql<number>`count(*)::int` })
        .from(auditEntries)
        .where(
          and(
            eq(auditEntries.tenantId, tenantId),
            eq(auditEntries.agentDid, agentDid),
            eq(auditEntries.connectionId, connectionId),
          ),
        );
      const row = rows[0];
      return row?.count ?? 0;
    },
    async listRecentActivity(limit = 10) {
      return client
        .select()
        .from(auditEntries)
        .where(eq(auditEntries.tenantId, tenantId))
        .orderBy(desc(auditEntries.timestamp), desc(auditEntries.id))
        .limit(limit);
    },

    // --- dashboard aggregates
    async getAgentActivitySummary() {
      // Three tenant-scoped queries in parallel: agents, active-connection
      // counts, and latest audit per agent. Merged in JS to avoid PG-dialect
      // lateral joins that PGlite + Neon HTTP disagree about on edge cases.
      const [agentRows, connRows, auditRows] = await Promise.all([
        client
          .select({ did: agents.did })
          .from(agents)
          .where(eq(agents.tenantId, tenantId)),
        client
          .select({
            agentDid: connections.agentDid,
            count: sql<number>`count(*)::int`,
          })
          .from(connections)
          .where(
            and(
              eq(connections.tenantId, tenantId),
              eq(connections.status, 'active'),
            ),
          )
          .groupBy(connections.agentDid),
        client
          .selectDistinctOn([auditEntries.agentDid], {
            agentDid: auditEntries.agentDid,
            timestamp: auditEntries.timestamp,
            msgId: auditEntries.msgId,
          })
          .from(auditEntries)
          .where(eq(auditEntries.tenantId, tenantId))
          .orderBy(
            auditEntries.agentDid,
            desc(auditEntries.timestamp),
            desc(auditEntries.id),
          ),
      ]);
      const countByAgent = new Map<string, number>();
      for (const r of connRows) countByAgent.set(r.agentDid, Number(r.count));
      const auditByAgent = new Map<
        string,
        { timestamp: Date; msgId: string }
      >();
      for (const r of auditRows) {
        auditByAgent.set(r.agentDid, { timestamp: r.timestamp, msgId: r.msgId });
      }
      return agentRows.map((a) => {
        const latest = auditByAgent.get(a.did);
        return {
          agentDid: a.did,
          activeConnections: countByAgent.get(a.did) ?? 0,
          lastAuditAt: latest ? latest.timestamp : null,
          lastAuditMsgId: latest ? latest.msgId : null,
        };
      });
    },

    // --- revocations
    async addRevocation(agentDid, kind, subjectId, reason) {
      await client
        .insert(revocations)
        .values({
          tenantId,
          agentDid,
          kind,
          subjectId,
          ...(reason ? { reason } : {}),
        })
        .onConflictDoNothing();
    },
    async isRevoked(agentDid, kind, subjectId) {
      const rows = await client
        .select({ subjectId: revocations.subjectId })
        .from(revocations)
        .where(
          and(
            eq(revocations.tenantId, tenantId),
            eq(revocations.agentDid, agentDid),
            eq(revocations.kind, kind),
            eq(revocations.subjectId, subjectId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
    async listRevocations(agentDid) {
      return client
        .select()
        .from(revocations)
        .where(
          and(eq(revocations.tenantId, tenantId), eq(revocations.agentDid, agentDid)),
        );
    },

    // --- usage
    async incrementUsage(period, patch) {
      const inbound = patch.inbound ?? 0;
      const outbound = patch.outbound ?? 0;
      const rows = await client
        .insert(usageCounters)
        .values({
          tenantId,
          period,
          inboundMessages: inbound,
          outboundMessages: outbound,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [usageCounters.tenantId, usageCounters.period],
          set: {
            inboundMessages: sql`${usageCounters.inboundMessages} + ${inbound}`,
            outboundMessages: sql`${usageCounters.outboundMessages} + ${outbound}`,
            updatedAt: new Date(),
          },
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error('incrementUsage returned no row');
      return row;
    },
    async getUsage(period) {
      const rows = await client
        .select()
        .from(usageCounters)
        .where(and(eq(usageCounters.tenantId, tenantId), eq(usageCounters.period, period)))
        .limit(1);
      return rows[0] ?? null;
    },

    // --- push registrations
    async upsertPushRegistration(input) {
      const rows = await client
        .insert(pushRegistrations)
        .values({
          tenantId,
          deviceToken: input.deviceToken,
          platform: input.platform,
          bundleId: input.bundleId,
        })
        .onConflictDoUpdate({
          target: [pushRegistrations.tenantId, pushRegistrations.deviceToken],
          set: {
            platform: input.platform,
            bundleId: input.bundleId,
            updatedAt: sql`now()`,
          },
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error('upsertPushRegistration returned no row');
      return row;
    },
    async listPushRegistrations() {
      return client
        .select()
        .from(pushRegistrations)
        .where(eq(pushRegistrations.tenantId, tenantId))
        .orderBy(desc(pushRegistrations.updatedAt));
    },
  };
  // Freeze to prevent monkey-patching bypasses.
  return Object.freeze(self) as TenantDb;
}

// Intentionally unused to silence eslint about unused `or`/`isNull` imports
// — kept in case we extend filters later; strip if the linter is strict.
void or;
void isNull;
