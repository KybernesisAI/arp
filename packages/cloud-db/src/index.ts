/**
 * @kybernesis/arp-cloud-db — multi-tenant Postgres schema + tenant-branded
 * query wrappers.
 *
 * Every runtime route in apps/cloud must open its database access through
 * `withTenant(db, tenantId)` after the session middleware has verified the
 * principal DID. Bypassing this wrapper by calling drizzle directly on the
 * raw client is a policy violation — keep it confined to bootstrap, stripe
 * webhooks, and the admin/root surface.
 */

export * from './types.js';
export * from './tenant-db.js';
export { schema } from './db.js';
export type { CloudDbClient } from './db.js';
export { createPgliteDb } from './pglite.js';
export type { PgliteOptions } from './pglite.js';
export { createNeonDb } from './neon.js';
export type { NeonOptions } from './neon.js';

// Re-export table handles for cross-tenant admin queries + migrations.
export {
  tenants,
  agents,
  connections,
  messages,
  auditEntries,
  revocations,
  usageCounters,
  stripeEvents,
  principalSessions,
  registrarBindings,
  onboardingSessions,
  pushRegistrations,
  rateLimitHits,
  userCredentials,
  webauthnChallenges,
  pairingInvitations,
} from './schema.js';
export type {
  TenantRow,
  AgentRow,
  ConnectionRow,
  MessageRow,
  AuditEntryRow,
  RevocationRow,
  UsageCounterRow,
  StripeEventRow,
  PrincipalSessionRow,
  RegistrarBindingRow,
  OnboardingSessionRow,
  PushRegistrationRow,
  RateLimitHitRow,
  UserCredentialRow,
  WebauthnChallengeRow,
  PairingInvitationRow,
} from './schema.js';
