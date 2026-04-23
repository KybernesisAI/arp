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
