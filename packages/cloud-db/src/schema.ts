/**
 * Drizzle schema for the ARP Cloud Postgres database.
 *
 * Shared by the migration runner + all typed query helpers. Every runtime
 * table carries a `tenant_id` so row-level isolation is enforced by adding a
 * `where(eq(tenants.id, ctx.tenantId))` predicate at the `TenantDb` wrapper
 * boundary — never from inside a route handler.
 */

import {
  pgTable,
  text,
  uuid,
  timestamp,
  bigserial,
  bigint,
  integer,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    principalDid: text('principal_did').notNull().unique(),
    displayName: text('display_name'),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    plan: text('plan').notNull().default('free'),
    status: text('status').notNull().default('active'),
    messageQuotaCents: integer('message_quota_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxPrincipal: index('idx_tenants_principal_did').on(t.principalDid),
    idxStripe: index('idx_tenants_stripe_customer').on(t.stripeCustomerId),
  }),
);

export const agents = pgTable(
  'agents',
  {
    did: text('did').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    principalDid: text('principal_did').notNull(),
    agentName: text('agent_name').notNull(),
    agentDescription: text('agent_description').notNull().default(''),
    publicKeyMultibase: text('public_key_multibase').notNull(),
    handoffJson: jsonb('handoff_json').notNull(),
    wellKnownDid: jsonb('well_known_did').notNull(),
    wellKnownAgentCard: jsonb('well_known_agent_card').notNull(),
    wellKnownArp: jsonb('well_known_arp').notNull(),
    scopeCatalogVersion: text('scope_catalog_version').notNull().default('v1'),
    tlsFingerprint: text('tls_fingerprint').notNull().default('cloud-hosted'),
    wsSessionId: text('ws_session_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => ({
    idxTenant: index('idx_agents_tenant').on(t.tenantId),
    idxWsSession: index('idx_agents_ws_session').on(t.wsSessionId),
  }),
);

export const connections = pgTable(
  'connections',
  {
    connectionId: text('connection_id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    agentDid: text('agent_did').notNull(),
    peerDid: text('peer_did').notNull(),
    label: text('label'),
    purpose: text('purpose'),
    tokenJws: text('token_jws').notNull(),
    tokenJson: jsonb('token_json').notNull(),
    cedarPolicies: jsonb('cedar_policies').notNull(),
    obligations: jsonb('obligations').notNull().default([]),
    scopeCatalogVersion: text('scope_catalog_version').notNull().default('v1'),
    status: text('status').notNull().default('active'),
    revokeReason: text('revoke_reason'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  },
  (t) => ({
    idxTenant: index('idx_connections_tenant').on(t.tenantId),
    idxAgent: index('idx_connections_agent').on(t.agentDid),
    idxPeer: index('idx_connections_peer').on(t.peerDid),
  }),
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    agentDid: text('agent_did').notNull(),
    connectionId: text('connection_id'),
    direction: text('direction').notNull(),
    msgId: text('msg_id').notNull(),
    msgType: text('msg_type').notNull(),
    envelopeJws: text('envelope_jws').notNull(),
    body: jsonb('body'),
    peerDid: text('peer_did'),
    status: text('status').notNull().default('queued'),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    idxAgentQueued: index('idx_messages_agent_queued').on(t.agentDid, t.createdAt),
    idxTenant: index('idx_messages_tenant').on(t.tenantId),
    idxMsgId: index('idx_messages_msg_id').on(t.agentDid, t.msgId),
  }),
);

export const auditEntries = pgTable(
  'audit_entries',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    agentDid: text('agent_did').notNull(),
    connectionId: text('connection_id').notNull(),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    msgId: text('msg_id').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    decision: text('decision').notNull(),
    obligations: jsonb('obligations').notNull().default([]),
    policiesFired: jsonb('policies_fired').notNull().default([]),
    reason: text('reason'),
    spendDeltaCents: integer('spend_delta_cents').notNull().default(0),
    prevHash: text('prev_hash').notNull(),
    selfHash: text('self_hash').notNull(),
  },
  (t) => ({
    idxTenant: index('idx_audit_tenant').on(t.tenantId),
    idxAgentConn: index('idx_audit_agent_conn').on(t.agentDid, t.connectionId, t.seq),
  }),
);

export const revocations = pgTable(
  'revocations',
  {
    tenantId: uuid('tenant_id').notNull(),
    agentDid: text('agent_did').notNull(),
    kind: text('kind').notNull(),
    subjectId: text('subject_id').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }).notNull().defaultNow(),
    reason: text('reason'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentDid, t.kind, t.subjectId] }),
    idxTenant: index('idx_revocations_tenant').on(t.tenantId),
  }),
);

export const usageCounters = pgTable(
  'usage_counters',
  {
    tenantId: uuid('tenant_id').notNull(),
    period: text('period').notNull(),
    inboundMessages: integer('inbound_messages').notNull().default(0),
    outboundMessages: integer('outbound_messages').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.period] }),
  }),
);

export const stripeEvents = pgTable('stripe_events', {
  eventId: text('event_id').primaryKey(),
  type: text('type').notNull(),
  tenantId: uuid('tenant_id'),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const principalSessions = pgTable(
  'principal_sessions',
  {
    sessionId: text('session_id').primaryKey(),
    principalDid: text('principal_did').notNull(),
    tenantId: uuid('tenant_id'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    idxPrincipal: index('idx_sessions_principal').on(t.principalDid),
  }),
);

// ----------------------------------------------------------- registrar_bindings
//
// Phase 9b: TLD registrar → cloud callback receiver. Populated by the
// `POST /internal/registrar/bind` endpoint (PSK-gated) when Headless — or any
// registrar speaking the v2.1 TLD integration spec — confirms an ARP-Cloud
// owner binding for a newly-purchased agent domain. `tenantId` is nullable
// because the registrar callback may land before the user has finished the
// `/onboard` flow (in which case a future login reconciles the row).
export const registrarBindings = pgTable(
  'registrar_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    domain: text('domain').notNull(),
    ownerLabel: text('owner_label').notNull(),
    registrar: text('registrar').notNull(),
    principalDid: text('principal_did').notNull(),
    publicKeyMultibase: text('public_key_multibase').notNull(),
    representationJwt: text('representation_jwt').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxDomainOwner: uniqueIndex('registrar_bindings_domain_owner').on(t.domain, t.ownerLabel),
    idxTenant: index('idx_registrar_bindings_tenant').on(t.tenantId),
  }),
);

// ---------------------------------------------------------- onboarding_sessions
//
// Phase 9b: short-lived record of a /onboard entry point visit. The registrar
// hands us `domain` / `registrar` / `callback_url` via query params; we persist
// them so a user who closes the tab mid-flow can be reconciled on next login.
// Populated when the user signs the representation JWT and we know which
// tenant (and therefore principal DID) the session belongs to. 1 hour TTL.
export const onboardingSessions = pgTable(
  'onboarding_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domain: text('domain').notNull(),
    registrar: text('registrar').notNull(),
    callbackUrl: text('callback_url').notNull(),
    principalDid: text('principal_did'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxExpires: index('idx_onboarding_sessions_expires').on(t.expiresAt),
  }),
);

// ----------------------------------------------------------- push_registrations
//
// Phase 9b: mobile APNs / FCM device token registry. Tenant-scoped; idempotent
// on `(tenant_id, device_token)` so re-registering from the same device just
// updates platform + bundle_id + `updated_at`.
export const pushRegistrations = pgTable(
  'push_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    deviceToken: text('device_token').notNull(),
    platform: text('platform').$type<'ios' | 'android'>().notNull(),
    bundleId: text('bundle_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenantToken: uniqueIndex('push_registrations_tenant_token').on(t.tenantId, t.deviceToken),
    idxTenant: index('idx_push_registrations_tenant').on(t.tenantId),
  }),
);

export type TenantRow = typeof tenants.$inferSelect;
export type AgentRow = typeof agents.$inferSelect;
export type ConnectionRow = typeof connections.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type AuditEntryRow = typeof auditEntries.$inferSelect;
export type RevocationRow = typeof revocations.$inferSelect;
export type UsageCounterRow = typeof usageCounters.$inferSelect;
export type StripeEventRow = typeof stripeEvents.$inferSelect;
export type PrincipalSessionRow = typeof principalSessions.$inferSelect;
export type RegistrarBindingRow = typeof registrarBindings.$inferSelect;
export type OnboardingSessionRow = typeof onboardingSessions.$inferSelect;
export type PushRegistrationRow = typeof pushRegistrations.$inferSelect;
