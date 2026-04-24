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

export interface PlanLimits {
  plan: 'free' | 'pro' | 'team';
  /** Inclusive agent count cap. `null` = unlimited. */
  maxAgents: number | null;
  /** Inclusive monthly inbound-message cap. `null` = unlimited. */
  maxInboundMessagesPerMonth: number | null;
  /** Monthly price cents (informational). */
  monthlyPriceCents: number;
}

export const PLAN_LIMITS: Record<PlanLimits['plan'], PlanLimits> = {
  free: {
    plan: 'free',
    maxAgents: 1,
    maxInboundMessagesPerMonth: 100,
    monthlyPriceCents: 0,
  },
  pro: {
    plan: 'pro',
    maxAgents: 1,
    maxInboundMessagesPerMonth: 10_000,
    monthlyPriceCents: 900,
  },
  team: {
    plan: 'team',
    maxAgents: 5,
    maxInboundMessagesPerMonth: 100_000,
    monthlyPriceCents: 2900,
  },
};

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
  // Phase-10b widened to include 'revoke' so the cloud revoke route can
  // append a chained entry that the audit viewer renders as a distinct
  // event type. The underlying hash chain doesn't care about the value —
  // it's hashed as-is via JCS + SHA-256.
  decision: 'allow' | 'deny' | 'revoke';
  timestamp: string;
  obligations: CloudObligation[];
  policiesFired: string[];
  reason?: string;
  spendDeltaCents?: number;
}
