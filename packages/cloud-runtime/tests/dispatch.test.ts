/**
 * Unit tests for `dispatchInbound`.
 *
 * Covers: envelope verify failures, unknown connection, deny decisions,
 * allow + enqueue, allow + immediate delivery via WS session.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dispatchInbound } from '../src/dispatch.js';
import type { AgentSessionHandle, WsServerEvent } from '../src/types.js';
import { createTestHarness, type TestHarness } from './helpers.js';

describe('dispatchInbound', () => {
  let h: TestHarness;

  beforeEach(async () => {
    h = await createTestHarness();
  });

  afterEach(async () => {
    await h.closeDb();
  });

  it('rejects envelopes with invalid signature', async () => {
    const tampered = 'aaaa.bbbb.cccc';
    const result = await dispatchInbound(
      {
        tenantDb: h.tenantDb,
        tenantId: h.tenantId,
        agentDid: h.agentDid,
        audit: h.audit,
        pdp: h.pdp,
        resolver: h.resolver,
        sessions: h.sessions,
        logger: h.logger,
        metrics: h.metrics,
        now: () => Date.now(),
      },
      tampered,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid|unknown_peer/);
  });

  it('denies when connection unknown', async () => {
    const envelope = await h.signFromPeer({
      id: 'msg-1',
      type: 'https://didcomm.org/arp/1.0/request',
      from: h.peerDid,
      to: [h.agentDid],
      body: { connection_id: 'does-not-exist', action: 'ping' },
    });
    const result = await dispatchInbound(
      {
        tenantDb: h.tenantDb,
        tenantId: h.tenantId,
        agentDid: h.agentDid,
        audit: h.audit,
        pdp: h.pdp,
        resolver: h.resolver,
        sessions: h.sessions,
        logger: h.logger,
        metrics: h.metrics,
        now: () => Date.now(),
      },
      envelope,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown_connection');
  });

  it('allows on valid request + enqueues when no session', async () => {
    await h.createActiveConnection('conn_abcd1');
    const envelope = await h.signFromPeer({
      id: 'msg-2',
      type: 'https://didcomm.org/arp/1.0/request',
      from: h.peerDid,
      to: [h.agentDid],
      body: { connection_id: 'conn_abcd1', action: 'ping' },
    });
    const result = await dispatchInbound(
      {
        tenantDb: h.tenantDb,
        tenantId: h.tenantId,
        agentDid: h.agentDid,
        audit: h.audit,
        pdp: h.pdp,
        resolver: h.resolver,
        sessions: h.sessions,
        logger: h.logger,
        metrics: h.metrics,
        now: () => Date.now(),
      },
      envelope,
    );
    expect(result.ok).toBe(true);
    expect(result.decision).toBe('allow');
    expect(result.queued).toBe(true);
    const queued = await h.tenantDb.claimQueuedMessages(h.agentDid);
    expect(queued.length).toBe(1);
    expect(queued[0]?.msgId).toBe('msg-2');

    // Audit entry recorded.
    const entries = await h.audit.list(h.agentDid, 'conn_abcd1');
    expect(entries.length).toBe(1);
    expect(entries[0]?.decision).toBe('allow');
  });

  it('allows + pushes over WS when session is live', async () => {
    await h.createActiveConnection('conn_abcd2');
    const delivered: WsServerEvent[] = [];
    const handle: AgentSessionHandle = {
      did: h.agentDid,
      tenantId: h.tenantId,
      sessionId: 'ws-test',
      openedAt: Date.now(),
      isOpen: () => true,
      async send(event) {
        delivered.push(event);
      },
      async close() {},
    };
    h.sessions.add(handle);

    const envelope = await h.signFromPeer({
      id: 'msg-3',
      type: 'https://didcomm.org/arp/1.0/request',
      from: h.peerDid,
      to: [h.agentDid],
      body: { connection_id: 'conn_abcd2', action: 'ping' },
    });
    const result = await dispatchInbound(
      {
        tenantDb: h.tenantDb,
        tenantId: h.tenantId,
        agentDid: h.agentDid,
        audit: h.audit,
        pdp: h.pdp,
        resolver: h.resolver,
        sessions: h.sessions,
        logger: h.logger,
        metrics: h.metrics,
        now: () => Date.now(),
      },
      envelope,
    );
    expect(result.ok).toBe(true);
    expect(result.queued).toBe(false);
    expect(delivered.length).toBe(1);
    expect(delivered[0]?.kind).toBe('inbound_message');
  });

  it('finds the connection when the row is stored from the peer-direction (same-tenant pairing)', async () => {
    // Simulate the same-tenant pairing case: only ONE row exists for the
    // pair, stored as agent=peer (ghost) / peer=us (samantha). The previous
    // dispatch lookup keyed strictly on agentDid=ctx.agentDid and rejected
    // this layout with missing_connection_id even though the pair is real.
    // Seed the peer as an agent in the same tenant so the FK on
    // connections.agent_did is satisfied (this is the same-tenant case).
    const ed = await import('@noble/ed25519');
    const { ed25519RawToMultibase } = await import('@kybernesis/arp-transport');
    const peerAgentPriv = ed.utils.randomPrivateKey();
    const peerAgentPub = await ed.getPublicKeyAsync(peerAgentPriv);
    await h.tenantDb.createAgent({
      did: h.peerDid,
      principalDid: 'did:key:zStubPeerPrincipal',
      agentName: 'peer-as-tenant-agent',
      agentDescription: 'test',
      publicKeyMultibase: ed25519RawToMultibase(peerAgentPub),
      handoffJson: {},
      wellKnownDid: {},
      wellKnownAgentCard: {},
      wellKnownArp: {},
      scopeCatalogVersion: 'v1',
      tlsFingerprint: 'cloud',
    });

    const reversedConnId = 'conn_rev_dir_1';
    const reversedToken = {
      connection_id: reversedConnId,
      issuer: 'did:key:zStub',
      subject: h.peerDid,
      audience: h.agentDid,
      purpose: 'test-reversed',
      cedar_policies: ['permit(principal, action, resource);'],
      obligations: [],
      scope_catalog_version: 'v1',
      expires: new Date(Date.now() + 86400_000).toISOString(),
      sigs: { issuer: 'stub', audience: 'stub' },
    };
    await h.tenantDb.createConnection({
      connectionId: reversedConnId,
      agentDid: h.peerDid, // <-- swapped vs. createActiveConnection
      peerDid: h.agentDid, // <-- swapped vs. createActiveConnection
      label: null,
      purpose: 'test-reversed',
      tokenJws: JSON.stringify(reversedToken),
      tokenJson: reversedToken as unknown as Record<string, unknown>,
      cedarPolicies: ['permit(principal, action, resource);'],
      obligations: [],
      scopeCatalogVersion: 'v1',
      metadata: null,
      expiresAt: null,
    });

    // Sender (peer) doesn't pass connection_id — the auto-resolve should
    // find the row via the peer-direction match.
    const envelope = await h.signFromPeer({
      id: 'msg-rev',
      type: 'https://didcomm.org/arp/1.0/request',
      from: h.peerDid,
      to: [h.agentDid],
      body: { action: 'ping' },
    });
    const result = await dispatchInbound(
      {
        tenantDb: h.tenantDb,
        tenantId: h.tenantId,
        agentDid: h.agentDid,
        audit: h.audit,
        pdp: h.pdp,
        resolver: h.resolver,
        sessions: h.sessions,
        logger: h.logger,
        metrics: h.metrics,
        now: () => Date.now(),
      },
      envelope,
    );
    expect(result.ok).toBe(true);
    expect(result.decision).toBe('allow');
    const entries = await h.audit.list(h.agentDid, reversedConnId);
    expect(entries.length).toBe(1);
    expect(entries[0]?.decision).toBe('allow');
  });

  it('plain text body without action is mapped to relay_to_principal on Principal::self', async () => {
    // Pairings minted from the scope picker include `messaging.relay.
    // to_principal` which permits Action::"relay_to_principal" on
    // Principal::"self". Plain `arpc send` ships {text: "..."} with no
    // explicit action — dispatch must map this to the same primitive
    // so general agent-to-agent chat works without callers having to
    // know the cedar action name.
    const relayPolicy = `permit (
  principal == Agent::"${h.peerDid}",
  action == Action::"relay_to_principal",
  resource == Principal::"self"
);`;
    await h.createActiveConnection('conn_relay_1', [relayPolicy]);
    const envelope = await h.signFromPeer({
      id: 'msg-relay',
      type: 'https://didcomm.org/arp/1.0/request',
      from: h.peerDid,
      to: [h.agentDid],
      body: { connection_id: 'conn_relay_1', text: 'hi from peer' },
    });
    const result = await dispatchInbound(
      {
        tenantDb: h.tenantDb,
        tenantId: h.tenantId,
        agentDid: h.agentDid,
        audit: h.audit,
        pdp: h.pdp,
        resolver: h.resolver,
        sessions: h.sessions,
        logger: h.logger,
        metrics: h.metrics,
        now: () => Date.now(),
      },
      envelope,
    );
    expect(result.ok).toBe(true);
    expect(result.decision).toBe('allow');
    const entries = await h.audit.list(h.agentDid, 'conn_relay_1');
    expect(entries[0]?.decision).toBe('allow');
  });

  it('responses (msg.type ending in /response) bypass PDP and audit auto_allow_response', async () => {
    // Cedar policies on a normal connection grant only one direction —
    // the audience as principal. Replies sent back from the issuer side
    // would otherwise always deny because the sender (issuer) isn't the
    // named principal. Replies are inherent to the conversation: the
    // original request was already permitted, so the response carries
    // through without per-action PDP gating.
    const onlyAtlasPolicy = `permit (
  principal == Agent::"did:web:atlas.agent",
  action == Action::"relay_to_principal",
  resource == Principal::"self"
);`;
    await h.createActiveConnection('conn_resp_1', [onlyAtlasPolicy]);
    const envelope = await h.signFromPeer({
      id: 'msg-resp',
      type: 'https://didcomm.org/arp/1.0/response',
      from: h.peerDid,
      to: [h.agentDid],
      body: { connection_id: 'conn_resp_1', text: 'hi back' },
    });
    const result = await dispatchInbound(
      {
        tenantDb: h.tenantDb,
        tenantId: h.tenantId,
        agentDid: h.agentDid,
        audit: h.audit,
        pdp: h.pdp,
        resolver: h.resolver,
        sessions: h.sessions,
        logger: h.logger,
        metrics: h.metrics,
        now: () => Date.now(),
      },
      envelope,
    );
    expect(result.ok).toBe(true);
    expect(result.decision).toBe('allow');
    const entries = await h.audit.list(h.agentDid, 'conn_resp_1');
    expect(entries[0]?.decision).toBe('allow');
    expect(entries[0]?.reason).toBe('auto_allow_response');
  });

  it('denies when connection revoked', async () => {
    await h.createActiveConnection('conn_rev01');
    await h.tenantDb.updateConnectionStatus('conn_rev01', 'revoked', 'owner');
    await h.tenantDb.addRevocation(h.agentDid, 'connection', 'conn_rev01', 'owner');
    const envelope = await h.signFromPeer({
      id: 'msg-4',
      type: 'https://didcomm.org/arp/1.0/request',
      from: h.peerDid,
      to: [h.agentDid],
      body: { connection_id: 'conn_rev01', action: 'ping' },
    });
    const result = await dispatchInbound(
      {
        tenantDb: h.tenantDb,
        tenantId: h.tenantId,
        agentDid: h.agentDid,
        audit: h.audit,
        pdp: h.pdp,
        resolver: h.resolver,
        sessions: h.sessions,
        logger: h.logger,
        metrics: h.metrics,
        now: () => Date.now(),
      },
      envelope,
    );
    expect(result.ok).toBe(false);
    // Either 'connection_revoked' or 'revoked' — both indicate the denial.
    expect(['connection_revoked', 'revoked']).toContain(result.reason);
    const entries = await h.audit.list(h.agentDid, 'conn_rev01');
    expect(entries[0]?.decision).toBe('deny');
  });
});
