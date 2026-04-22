import type { ConnectionToken } from '@kybernesis/arp-spec';

export type ConnectionStatus = 'active' | 'suspended' | 'revoked';

export interface ConnectionRecord {
  connection_id: string;
  label: string | null;
  self_did: string;
  peer_did: string;
  purpose: string | null;
  token_jws: string;
  token: ConnectionToken;
  cedar_policies: string[];
  status: ConnectionStatus;
  created_at: number;
  expires_at: number | null;
  last_message_at: number | null;
  metadata: Record<string, unknown> | null;
}

export interface CreateConnectionInput {
  /** The verified Connection Token payload (already schema-validated). */
  token: ConnectionToken;
  /** Raw JWS/UCAN string we'll keep on disk for audit + later re-verify. */
  token_jws: string;
  /** Agent-local alias for the connection. */
  label?: string;
  /** The DID that OWNS this registry (i.e. the running agent). */
  self_did: string;
  /** Optional arbitrary metadata (JSON-serialisable). */
  metadata?: Record<string, unknown>;
}

export interface ConnectionFilter {
  peer_did?: string;
  status?: ConnectionStatus;
  includeExpired?: boolean;
}

export type RevocationType = 'connection' | 'key';

export interface Revocation {
  type: RevocationType;
  id: string;
  revoked_at: number;
  reason: string | null;
}
