/**
 * Phase 10 slice 10e — A3: sidecar↔sidecar pairing round-trip.
 *
 * Two sidecars (`createRuntime` instances), no cloud involvement at all.
 * This is the sovereign / no-cloud-required path — the test exists to
 * prove the runtime's `/admin/pairing/*` HTTP surface remains a complete
 * peer-to-peer story without cloud orchestration.
 *
 *   1. Sidecar A's owner creates a signed proposal (issuer-only) and
 *      stages it via `POST /admin/pairing/invitations` so the owner-app
 *      can list pending outbound invitations.
 *   2. Sidecar B's owner countersigns the proposal and posts the
 *      resulting Connection Token to its own `POST /admin/pairing/accept`.
 *   3. Sidecar A's owner posts the same dual-signed token to its own
 *      `POST /admin/pairing/accept`. This is what closes the loop in the
 *      sidecar↔sidecar flow — both sides import the connection token
 *      independently.
 *   4. Both sidecars list the connection via `GET /admin/connections` and
 *      agree on the connection id, peers, and issuer DID.
 *
 * Bonus: the staged invitation row on sidecar A vanishes from
 * `GET /admin/pairing/invitations` once the connection is created —
 * proves the runtime's accept handler clears the pending entry.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { countersignProposal } from '@kybernesis/arp-pairing';
import { bootSidecarPair, type SidecarPair } from './helpers/runtime-pair';
import {
  loadScopesFromDirectory,
  resolvePrincipal,
  mintIssuerProposal,
} from './helpers/cloud-fixtures';

const ADMIN_BEARER = 'Bearer s3cret-phase10';
const catalog = loadScopesFromDirectory();

let pair: SidecarPair | null = null;

afterEach(async () => {
  if (pair) {
    await pair.cleanup();
    pair = null;
  }
});

async function postPairingInvitation(
  baseUrl: string,
  proposal: unknown,
  invitationUrl: string | null,
): Promise<Response> {
  return fetch(`${baseUrl}/admin/pairing/invitations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: ADMIN_BEARER },
    body: JSON.stringify({ proposal, invitation_url: invitationUrl }),
  });
}

async function getPairingInvitations(baseUrl: string): Promise<{
  invitations: Array<{ connection_id: string; invitation_url: string | null }>;
}> {
  const res = await fetch(`${baseUrl}/admin/pairing/invitations`, {
    headers: { authorization: ADMIN_BEARER },
  });
  if (!res.ok) throw new Error(`admin/pairing/invitations ${res.status}`);
  return (await res.json()) as { invitations: Array<{ connection_id: string; invitation_url: string | null }> };
}

async function postPairingAccept(
  baseUrl: string,
  token: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${baseUrl}/admin/pairing/accept`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: ADMIN_BEARER },
    body: JSON.stringify({ token }),
  });
}

async function getConnections(baseUrl: string): Promise<{
  connections: Array<{
    connection_id: string;
    self_did: string;
    peer_did: string;
    issuer: string;
    status: string;
  }>;
}> {
  const res = await fetch(`${baseUrl}/admin/connections`, {
    headers: { authorization: ADMIN_BEARER },
  });
  if (!res.ok) throw new Error(`admin/connections ${res.status}`);
  return (await res.json()) as {
    connections: Array<{
      connection_id: string;
      self_did: string;
      peer_did: string;
      issuer: string;
      status: string;
    }>;
  };
}

describe('Phase 10/10e — sidecar↔sidecar pairing round-trip', () => {
  it('both sides hold the same connection token after dual /admin/pairing/accept', async () => {
    const aliceOwner = await resolvePrincipal(61);
    const bobOwner = await resolvePrincipal(67);
    pair = await bootSidecarPair({
      aliceDid: 'did:web:alice-side.agent',
      bobDid: 'did:web:bob-side.agent',
      alicePrincipalDid: aliceOwner.did,
      bobPrincipalDid: bobOwner.did,
    });

    // STEP 1: alice (issuer) drafts an invitation. Stage it through
    // /admin/pairing/invitations so the owner-app's pending-invitations
    // list reflects the right intent.
    const issuerProposal = await mintIssuerProposal(
      catalog,
      aliceOwner,
      pair.alice.did,
      pair.bob.did,
    );
    const stageRes = await postPairingInvitation(
      pair.alice.baseUrl,
      issuerProposal,
      null,
    );
    expect(stageRes.status).toBe(200);
    const stageBody = (await stageRes.json()) as { connection_id: string };
    expect(stageBody.connection_id).toBe(issuerProposal.connection_id);

    const stagedList = await getPairingInvitations(pair.alice.baseUrl);
    expect(stagedList.invitations).toHaveLength(1);
    expect(stagedList.invitations[0]?.connection_id).toBe(
      issuerProposal.connection_id,
    );

    // STEP 2: bob (acceptor) countersigns.
    const dualSigned = await countersignProposal({
      proposal: issuerProposal,
      counterpartyKey: { privateKey: bobOwner.privateKey, kid: `${bobOwner.did}#key-1` },
      counterpartyDid: bobOwner.did,
    });
    const tokenJson = dualSigned.token as unknown as Record<string, unknown>;

    // STEP 3a: bob imports via its own /admin/pairing/accept.
    const bobAcceptRes = await postPairingAccept(pair.bob.baseUrl, tokenJson);
    expect(bobAcceptRes.status).toBe(200);
    const bobAcceptBody = (await bobAcceptRes.json()) as {
      connection: { connection_id: string; self_did: string; peer_did: string };
    };
    expect(bobAcceptBody.connection.connection_id).toBe(
      issuerProposal.connection_id,
    );
    expect(bobAcceptBody.connection.self_did).toBe(pair.bob.did);
    expect(bobAcceptBody.connection.peer_did).toBe(pair.alice.did);

    // STEP 3b: alice imports the dual-signed token too. Closes the loop —
    // both sides hold the connection.
    const aliceAcceptRes = await postPairingAccept(pair.alice.baseUrl, tokenJson);
    expect(aliceAcceptRes.status).toBe(200);

    // STEP 4: both sides list the same connection_id with mirrored
    // self/peer fields.
    const aliceConns = await getConnections(pair.alice.baseUrl);
    const bobConns = await getConnections(pair.bob.baseUrl);
    expect(aliceConns.connections).toHaveLength(1);
    expect(bobConns.connections).toHaveLength(1);
    expect(aliceConns.connections[0]?.connection_id).toBe(
      bobConns.connections[0]?.connection_id,
    );
    expect(aliceConns.connections[0]?.self_did).toBe(pair.alice.did);
    expect(aliceConns.connections[0]?.peer_did).toBe(pair.bob.did);
    expect(bobConns.connections[0]?.self_did).toBe(pair.bob.did);
    expect(bobConns.connections[0]?.peer_did).toBe(pair.alice.did);
    // Both sides share the issuer DID — the proposal's issuer is the
    // sovereign source of truth for who minted the connection.
    expect(aliceConns.connections[0]?.issuer).toBe(aliceOwner.did);
    expect(bobConns.connections[0]?.issuer).toBe(aliceOwner.did);
    // Both rows are active.
    expect(aliceConns.connections[0]?.status).toBe('active');
    expect(bobConns.connections[0]?.status).toBe('active');

    // BONUS: alice's pending-invitations list is empty post-accept; the
    // runtime's /admin/pairing/accept handler clears the staged entry.
    const remaining = await getPairingInvitations(pair.alice.baseUrl);
    expect(remaining.invitations).toHaveLength(0);
  });
});
