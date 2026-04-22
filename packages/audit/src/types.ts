import type { Obligation } from '@kybernesis/arp-spec';

export type AuditDecision = 'allow' | 'deny';

/** Prefix used on all hash strings. Makes the algorithm explicit at a glance. */
export const HASH_PREFIX = 'sha256:';
/** Genesis `prev_hash` — 32 bytes of zero. */
export const GENESIS_PREV_HASH = `${HASH_PREFIX}${'00'.repeat(32)}`;

export interface AuditEntryInput {
  /** DIDComm message id / request id. Required for correlation. */
  msg_id: string;
  /** PDP decision. */
  decision: AuditDecision;
  /** IDs of the policies that matched (Cedar policy IDs). */
  policies_fired: string[];
  /** Obligations attached to the decision (PDP output). */
  obligations?: Obligation[];
  /** Cent-denominated delta to this connection's spend. Default 0. */
  spend_delta_cents?: number;
  /** Optional human-readable reason (denied requests in particular). */
  reason?: string;
  /** ISO-8601 timestamp. Defaults to `now()` at append time. */
  timestamp?: string;
}

export interface AuditEntry extends Required<Omit<AuditEntryInput, 'obligations' | 'spend_delta_cents' | 'reason' | 'timestamp'>> {
  seq: number;
  timestamp: string;
  obligations: Obligation[];
  spend_delta_cents: number;
  reason: string | null;
  prev_hash: string;
  self_hash: string;
}

export interface VerifyResult {
  valid: boolean;
  entriesSeen: number;
  /** Index (seq) at which the chain first failed to verify. */
  firstBreakAt?: number;
  error?: string;
}
