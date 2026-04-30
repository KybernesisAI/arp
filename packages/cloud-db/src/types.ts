/**
 * Public surface of the cloud-db package.
 */

export type TenantId = string & { readonly __brand: 'TenantId' };

/** Cast a raw UUID string into a TenantId. Call site declares it's been
 *  authenticated (session-derived), which is the only place tenant ids may
 *  cross the trust boundary. Every other callsite handles `TenantId` opaquely.
 */
export function toTenantId(raw: string): TenantId {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new TypeError('tenant id must be a non-empty string');
  }
  return raw as TenantId;
}

/**
 * Pricing tiers (Phase-10 rewrite).
 *
 * Two plans only:
 *  - free: 1 agent, 100 inbound msgs/mo, $0
 *  - pro:  N agents (Stripe subscription `quantity`), 10_000 inbound msgs/mo
 *          *shared* across all agents on the tenant, $5 per agent / month.
 *
 * The "team" tier from v0 was collapsed into pro-with-quantity. The Stripe
 * subscription carries one line item priced at $5/mo with a per-tenant
 * `quantity` matching the number of provisioned agents on that tenant.
 */
export interface PlanLimits {
  plan: 'free' | 'pro' | 'internal';
  /** Inclusive agent count cap when subscription quantity is fixed (free).
   *  `null` = "scaled by subscription quantity" (pro) or "unlimited"
   *  (internal). */
  maxAgents: number | null;
  /** Inclusive monthly inbound-message cap shared across all agents on
   *  the tenant. `null` = unlimited. */
  maxInboundMessagesPerMonth: number | null;
  /** Per-agent price cents (informational; the bill is qty * this). */
  perAgentPriceCents: number;
}

export const PLAN_LIMITS: Record<PlanLimits['plan'], PlanLimits> = {
  free: {
    plan: 'free',
    maxAgents: 1,
    // 1,000 inbound msgs/mo — gives room for real testing without
    // hitting quota on the second day. Pro stays at 10k for paying
    // tenants; the gap is meaningful but the floor isn't punitive.
    maxInboundMessagesPerMonth: 1_000,
    perAgentPriceCents: 0,
  },
  pro: {
    plan: 'pro',
    maxAgents: null,
    maxInboundMessagesPerMonth: 10_000,
    perAgentPriceCents: 500,
  },
  // Internal accounts (ARP team, integration tests, design partners
  // we explicitly comp). Bypasses every quota; never billed.
  internal: {
    plan: 'internal',
    maxAgents: null,
    maxInboundMessagesPerMonth: null,
    perAgentPriceCents: 0,
  },
};

/**
 * Effective per-tenant agent cap. Free tenants are hard-capped at
 * PLAN_LIMITS.free.maxAgents; Pro tenants are capped at the Stripe
 * subscription `quantity` (auto-synced on agent create + archive).
 */
export function effectiveMaxAgents(
  plan: string,
  subscriptionQuantity: number,
): number | null {
  if (plan === 'free') return PLAN_LIMITS.free.maxAgents;
  if (plan === 'pro') return Math.max(1, subscriptionQuantity);
  return null;
}

/** Monthly bill in cents for the given plan + quantity. */
export function monthlyBillCents(plan: string, subscriptionQuantity: number): number {
  if (plan === 'free') return 0;
  if (plan === 'pro') {
    return PLAN_LIMITS.pro.perAgentPriceCents * Math.max(1, subscriptionQuantity);
  }
  return 0;
}

/**
 * Quota check for inbound messages. Returns null when the tenant is within
 * cap; returns the plan limits when the next message WOULD exceed the cap.
 *
 * Pure function so both the cloud HTTP layer and the cloud-runtime dispatch
 * path can call it. Cap is shared across all of the tenant's agents.
 */
export function checkQuota(
  plan: string,
  inboundThisMonth: number,
): PlanLimits | null {
  const limits = (PLAN_LIMITS as Record<string, PlanLimits | undefined>)[plan];
  if (!limits) return null;
  if (limits.maxInboundMessagesPerMonth === null) return null;
  if (inboundThisMonth < limits.maxInboundMessagesPerMonth) return null;
  return limits;
}

export interface CloudObligation {
  type: string;
  params: Record<string, unknown>;
}

export interface EnqueuedMessage {
  id: string;
  msgId: string;
  msgType: string;
  envelopeJws: string;
  body: Record<string, unknown> | null;
  peerDid: string | null;
  connectionId: string | null;
  createdAtMs: number;
}

export interface AuditInsertInput {
  connectionId: string;
  msgId: string;
  // Phase-10b widened to include 'revoke' for the cloud revoke route's
  // chained audit entry. Phase-12+ extends this to 'suspend' / 'resume'
  // for reversible owner-initiated pauses, and 'rescope' for connection-
  // edit-driven token replacements. The underlying hash chain doesn't
  // care about the value — it's hashed as-is via JCS + SHA-256.
  decision: 'allow' | 'deny' | 'revoke' | 'suspend' | 'resume' | 'rescope';
  timestamp: string;
  obligations: CloudObligation[];
  policiesFired: string[];
  reason?: string;
  spendDeltaCents?: number;
}
