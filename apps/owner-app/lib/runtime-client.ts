import { env } from './env';

/**
 * Thin typed wrapper over the runtime's `/admin/*` HTTP surface. Never
 * exposed to the browser — callers live in server components or route
 * handlers. The bearer token is sourced from `ARP_ADMIN_TOKEN` and stays
 * server-side by contract.
 */
export class RuntimeClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(override?: { baseUrl?: string; token?: string }) {
    const e = env();
    this.baseUrl = override?.baseUrl ?? e.ARP_RUNTIME_URL;
    this.token = override?.token ?? e.ARP_ADMIN_TOKEN;
  }

  async listConnections(): Promise<{ connections: AdminConnectionSummary[] }> {
    return this.get('/admin/connections');
  }

  async getConnection(id: string): Promise<{ connection: AdminConnectionDetail } | null> {
    const res = await this.fetch(`/admin/connections/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as { connection: AdminConnectionDetail };
  }

  async createConnection(token: unknown): Promise<{ connection: AdminConnectionDetail }> {
    return this.post('/admin/connections', { token });
  }

  async revokeConnection(id: string, reason?: string): Promise<void> {
    await this.post(`/admin/connections/${encodeURIComponent(id)}/revoke`, { reason });
  }

  async suspendConnection(id: string): Promise<void> {
    await this.post(`/admin/connections/${encodeURIComponent(id)}/suspend`, {});
  }

  async resumeConnection(id: string): Promise<void> {
    await this.post(`/admin/connections/${encodeURIComponent(id)}/resume`, {});
  }

  async getAudit(
    id: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<AuditResponse> {
    const qs = new URLSearchParams();
    if (opts.limit !== undefined) qs.set('limit', String(opts.limit));
    if (opts.offset !== undefined) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    const path = `/admin/audit/${encodeURIComponent(id)}${q ? `?${q}` : ''}`;
    return this.get(path);
  }

  async verifyAudit(id: string): Promise<{ verification: VerifyResultPayload }> {
    return this.post(`/admin/audit/${encodeURIComponent(id)}/verify`, {});
  }

  async listPendingInvitations(): Promise<{ invitations: PendingInvitation[] }> {
    return this.get('/admin/pairing/invitations');
  }

  async storeInvitation(
    proposal: unknown,
    invitationUrl: string | null,
  ): Promise<{ ok: true; connection_id: string; invitation_url: string | null }> {
    return this.post('/admin/pairing/invitations', {
      proposal,
      invitation_url: invitationUrl,
    });
  }

  async acceptPairing(token: unknown): Promise<{ connection: AdminConnectionDetail }> {
    return this.post('/admin/pairing/accept', { token });
  }

  /* ---- WebAuthn (Phase 10/10d) ---- */

  async webauthnRegisterOptions(): Promise<unknown> {
    return this.post('/admin/webauthn/register/options', {});
  }

  async webauthnRegisterVerify(body: {
    response: unknown;
    nickname?: string | null;
  }): Promise<{ id: string; credentialId: string }> {
    return this.post('/admin/webauthn/register/verify', body);
  }

  async webauthnAuthOptions(): Promise<unknown> {
    return this.post('/admin/webauthn/auth/options', {});
  }

  async webauthnAuthVerify(body: { response: unknown }): Promise<{
    id: string;
    credentialId: string;
    principalDid: string;
    agentDid: string;
  }> {
    return this.post('/admin/webauthn/auth/verify', body);
  }

  async listWebauthnCredentials(): Promise<{ credentials: WebauthnCredentialSummary[] }> {
    return this.get('/admin/webauthn/credentials');
  }

  async renameWebauthnCredential(
    id: string,
    nickname: string | null,
  ): Promise<{ ok: true; id: string; nickname: string | null }> {
    const res = await this.fetch(`/admin/webauthn/credentials/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname }),
    });
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as { ok: true; id: string; nickname: string | null };
  }

  async deleteWebauthnCredential(id: string): Promise<void> {
    const res = await this.fetch(`/admin/webauthn/credentials/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw await this.toError(res);
  }

  /* ---- Identity rotation (Phase 10/10d) ---- */

  async getIdentity(): Promise<IdentityState> {
    return this.get('/admin/identity');
  }

  async rotateIdentity(body: {
    new_principal_did: string;
    new_public_key_multibase: string;
  }): Promise<{
    ok: true;
    principal_did: string;
    previous_principal_did?: string;
    previous_deprecated_at?: string;
    no_change?: boolean;
  }> {
    return this.post('/admin/identity/rotate', body);
  }

  /* ---- low-level helpers ---- */

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetch(path);
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as T;
  }

  private fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(init.headers ?? {});
    headers.set('authorization', `Bearer ${this.token}`);
    return fetch(url, { ...init, headers, cache: 'no-store' });
  }

  private async toError(res: Response): Promise<Error> {
    const text = await res.text().catch(() => '');
    return new Error(
      `runtime admin ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`,
    );
  }
}

export interface AdminConnectionSummary {
  connection_id: string;
  label: string | null;
  self_did: string;
  peer_did: string;
  purpose: string | null;
  status: 'active' | 'suspended' | 'revoked';
  created_at: number;
  expires_at: number | null;
  last_message_at: number | null;
  cedar_policies: string[];
  obligations: Array<{ type: string; params: Record<string, unknown> }>;
  issuer: string;
  scope_catalog_version: string;
}

export interface AdminConnectionDetail {
  connection_id: string;
  label: string | null;
  self_did: string;
  peer_did: string;
  purpose: string | null;
  token_jws: string;
  token: ConnectionTokenPayload;
  cedar_policies: string[];
  status: 'active' | 'suspended' | 'revoked';
  created_at: number;
  expires_at: number | null;
  last_message_at: number | null;
  metadata: Record<string, unknown> | null;
}

export interface ConnectionTokenPayload {
  connection_id: string;
  issuer: string;
  subject: string;
  audience: string;
  purpose: string;
  cedar_policies: string[];
  obligations: Array<{ type: string; params: Record<string, unknown> }>;
  scope_catalog_version: string;
  expires: string;
  sigs: Record<string, string>;
}

export interface AuditEntry {
  seq: number;
  timestamp: string;
  msg_id: string;
  decision: 'allow' | 'deny';
  policies_fired: string[];
  obligations: Array<{ type: string; params: Record<string, unknown> }>;
  spend_delta_cents: number;
  reason: string | null;
  prev_hash: string;
  self_hash: string;
}

export interface AuditResponse {
  connection_id: string;
  total: number;
  offset: number;
  limit: number;
  entries: AuditEntry[];
  verification: VerifyResultPayload;
}

export interface VerifyResultPayload {
  valid: boolean;
  entriesSeen: number;
  firstBreakAt?: number;
  error?: string;
}

export interface PendingInvitation {
  connection_id: string;
  invitation_url: string | null;
  created_at: string;
  proposal: Record<string, unknown>;
}

export interface WebauthnCredentialSummary {
  id: string;
  credential_id: string;
  nickname: string | null;
  transports: string[];
  created_at: string;
  last_used_at: string | null;
}

export interface IdentityState {
  principal_did: string;
  principal_public_key_multibase: string;
  previous_principal_did: string | null;
  previous_principal_public_key_multibase: string | null;
  previous_deprecated_at: string | null;
}
