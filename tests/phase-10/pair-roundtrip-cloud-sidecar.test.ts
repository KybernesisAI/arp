/**
 * Phase 10 slice 10e — A2: cloud↔sidecar pairing round-trip.
 *
 * One side is a cloud tenant on `cloud.arp.run`; the other side is an agent
 * running behind a local sidecar (`createRuntime`). We verify both halves
 * end up with a Connection Token referencing the same `connection_id`,
 * even though the cloud side has no acceptor cloud-tenant insert (the
 * sidecar agent's principal is not a cloud tenant — that's the point).
 *
 *   1. Cloud tenant A's owner posts an issuer-signed proposal to
 *      `POST /api/pairing/invitations`. Cloud db gains a
 *      `pairing_invitations` row.
 *   2. The sidecar's owner principal countersigns the SAME proposal
 *      (preserving proposal_id + connection_id), then posts the
 *      resulting ConnectionToken to the sidecar's
 *      `POST /admin/pairing/accept`.
 *   3. Sidecar's connection registry now holds a row keyed on the same
 *      `connection_id`; cloud's invitation row stays as evidence of the
 *      issuer-side intent.
 *
 * This test is scoped to the Phase-10a contract: the cloud /accept route
 * only inserts cross-tenant when the acceptor is a cloud tenant. A
 * sidecar acceptor has no cloud tenancy, so the issuer-side cloud
 * tenant's connection row materialises later (mobile/cloud reconciliation
 * — out of scope for this slice). The assertion here is that both sides
 * agree on the connection_id + identities, which is the load-bearing
 * cross-instance invariant.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPgliteDb,
  pairingInvitations,
  type CloudDbClient,
} from '@kybernesis/arp-cloud-db';
import { countersignProposal } from '@kybernesis/arp-pairing';
import { bootSidecarPair, type SidecarPair } from './helpers/runtime-pair';
import {
  loadScopesFromDirectory,
  resolvePrincipal,
  seedTenant,
  seedCloudAgent,
  syntheticAgentMultibase,
  mintIssuerProposal,
  type Principal,
} from './helpers/cloud-fixtures';

process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'phase-10-session-secret-aaaaaaaa';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
let sessionOverride: { principalDid: string; tenantId: string | null } | null = null;
let pair: SidecarPair | null = null;

vi.mock('@/lib/db', async () => ({
  getDb: async () => {
    if (!currentDb) throw new Error('test db not initialised');
    return currentDb.db;
  },
}));

vi.mock('@/lib/session', async () => ({
  getSession: async () => {
    if (!sessionOverride) return null;
    return {
      ...sessionOverride,
      nonce: 'phase10-nonce',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3_600_000,
    };
  },
}));

const { POST: PostInvitation } = await import(
  '@/app/api/pairing/invitations/route'
);

const catalog = loadScopesFromDirectory();
const ADMIN_BEARER = 'Bearer s3cret-phase10';

async function postSidecarAccept(
  baseUrl: string,
  token: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${baseUrl}/admin/pairing/accept`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: ADMIN_BEARER,
    },
    body: JSON.stringify({ token }),
  });
}

async function getSidecarConnections(baseUrl: string): Promise<{
  connections: Array<{
    connection_id: string;
    self_did: string;
    peer_did: string;
    issuer: string;
  }>;
}> {
  const res = await fetch(`${baseUrl}/admin/connections`, {
    headers: { authorization: ADMIN_BEARER },
  });
  if (!res.ok) throw new Error(`admin/connections ${res.status}`);
  return (await res.json()) as { connections: Array<{
    connection_id: string;
    self_did: string;
    peer_did: string;
    issuer: string;
  }> };
}

describe('Phase 10/10e — cloud↔sidecar pairing round-trip', () => {
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    sessionOverride = null;
  });
  afterEach(async () => {
    if (currentDb) {
      await currentDb.close();
      currentDb = null;
    }
    if (pair) {
      await pair.cleanup();
      pair = null;
    }
    sessionOverride = null;
  });

  it('cloud invitation + sidecar /admin/pairing/accept agree on the same connection_id', async () => {
    if (!currentDb) throw new Error('db gone');

    // Sidecar boot: one runtime per side. Only the sidecar (alice) accepts;
    // bob exists as a peer placeholder so the helper can wire its
    // shared-fetch bus, but we don't drive bob in this test.
    const cloudIssuerOwner: Principal = await resolvePrincipal(53);
    const sidecarOwner: Principal = await resolvePrincipal(57);
    pair = await bootSidecarPair({
      aliceDid: 'did:web:agent-sidecar.agent',
      bobDid: 'did:web:placeholder.agent',
      alicePrincipalDid: sidecarOwner.did,
    });
    const sidecarAgentDid = pair.alice.did;
    const cloudIssuerAgentDid = 'did:web:agent-cloud.agent';
    const cloudIssuerAgentMb = await syntheticAgentMultibase(123);

    // Seed the cloud-issuer tenant and its agent.
    const cloudTenantId = await seedTenant(currentDb.db, cloudIssuerOwner.did);
    await seedCloudAgent(
      currentDb.db,
      cloudTenantId,
      cloudIssuerOwner.did,
      cloudIssuerAgentDid,
      cloudIssuerAgentMb,
    );

    // STEP 1: cloud creates the invitation. Issuer-only signature. The
    // /invitations route persists the row + returns a fragment URL.
    sessionOverride = { principalDid: cloudIssuerOwner.did, tenantId: cloudTenantId };
    const issuerProposal = await mintIssuerProposal(
      catalog,
      cloudIssuerOwner,
      cloudIssuerAgentDid,
      sidecarAgentDid,
    );
    const inviteRes = await PostInvitation(
      new Request('https://cloud.arp.run/api/pairing/invitations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-host': 'cloud.arp.run',
          'x-forwarded-proto': 'https',
        },
        body: JSON.stringify({ proposal: issuerProposal }),
      }),
    );
    expect(inviteRes.status).toBe(200);
    const inviteBody = (await inviteRes.json()) as { connectionId: string };
    expect(inviteBody.connectionId).toBe(issuerProposal.connection_id);

    // STEP 2: sidecar owner countersigns the SAME proposal payload. This
    // mirrors the real-world flow where the sidecar's owner browser
    // receives the URL fragment, decodes it, and signs locally.
    const dualSigned = await countersignProposal({
      proposal: issuerProposal,
      counterpartyKey: {
        privateKey: sidecarOwner.privateKey,
        kid: `${sidecarOwner.did}#key-1`,
      },
      counterpartyDid: sidecarOwner.did,
    });
    // The Connection Token projected out of countersignProposal is what
    // /admin/pairing/accept on the sidecar consumes.
    const acceptRes = await postSidecarAccept(
      pair.alice.baseUrl,
      dualSigned.token as unknown as Record<string, unknown>,
    );
    expect(acceptRes.status).toBe(200);
    const acceptBody = (await acceptRes.json()) as {
      connection: { connection_id: string; self_did: string; peer_did: string };
    };
    expect(acceptBody.connection.connection_id).toBe(issuerProposal.connection_id);
    // The sidecar self_did must be the sidecar's own agent DID — the
    // accept route stamps that from the runtime's bound identity.
    expect(acceptBody.connection.self_did).toBe(sidecarAgentDid);
    expect(acceptBody.connection.peer_did).toBe(cloudIssuerAgentDid);

    // STEP 3a: cloud invitation row persists, references the SAME
    // connection_id (via challenge=proposal_id; connection_id lives in the
    // payload). Slice 10a's design intentionally does NOT auto-consume
    // this row when the acceptor is a sovereign sidecar; coordinator
    // catches up on first DIDComm exchange.
    const invitationRows = await currentDb.db.select().from(pairingInvitations);
    expect(invitationRows).toHaveLength(1);
    expect(invitationRows[0]?.tenantId).toBe(cloudTenantId);
    expect(invitationRows[0]?.challenge).toBe(issuerProposal.proposal_id);
    // No cloud-side acceptor tenancy → no auto-flip.
    expect(invitationRows[0]?.consumedAt).toBeNull();

    // STEP 3b: sidecar's connection registry has exactly one row with the
    // shared connection_id.
    const sidecarConns = await getSidecarConnections(pair.alice.baseUrl);
    expect(sidecarConns.connections).toHaveLength(1);
    expect(sidecarConns.connections[0]?.connection_id).toBe(
      issuerProposal.connection_id,
    );
    expect(sidecarConns.connections[0]?.self_did).toBe(sidecarAgentDid);
    expect(sidecarConns.connections[0]?.peer_did).toBe(cloudIssuerAgentDid);
    expect(sidecarConns.connections[0]?.issuer).toBe(cloudIssuerOwner.did);
  });
});
