/**
 * Phase 10 slice 10e — A6: revoke while messages are in flight.
 *
 * Alice and Bob hold a paired connection. Alice sends one allowed message
 * (Bob audits + dispatches a reply). Bob's owner revokes the connection.
 * Alice — unaware — fires another message. Bob's runtime short-circuits
 * before PDP eval because the registry reports the connection revoked,
 * audits a `deny` entry with `reason='revoked'`, and replies deny to
 * Alice.
 *
 * Asserts:
 *   - Bob's audit shows: [allow, deny(reason=revoked)] in order.
 *   - Bob's dispatch handler fired exactly once (only for the pre-revoke
 *     message).
 *   - Bob's reply to Alice for the post-revoke message carries
 *     `body.decision='deny'`.
 *   - The audit chain stays valid across the revoke boundary
 *     (`verifyAuditChain` returns ok=true with entriesSeen=2).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ConnectionToken } from '@kybernesis/arp-spec';
import { verifyAuditChain } from '@kybernesis/arp-audit';
import { bootSidecarPair, type SidecarPair } from './helpers/runtime-pair';
import { resolvePrincipal } from './helpers/cloud-fixtures';

let pair: SidecarPair | null = null;
afterEach(async () => {
  if (pair) {
    await pair.cleanup();
    pair = null;
  }
});

describe('Phase 10/10e — revoke between messages', () => {
  it('first msg allowed, revoke fires, second msg audits deny without dispatch', async () => {
    const aliceOwner = await resolvePrincipal(91);
    const bobOwner = await resolvePrincipal(93);
    const bobDispatchCalls: string[] = [];

    pair = await bootSidecarPair({
      aliceDid: 'did:web:alice-rev.agent',
      bobDid: 'did:web:bob-rev.agent',
      alicePrincipalDid: aliceOwner.did,
      bobPrincipalDid: bobOwner.did,
      bobDispatch: async ({ message }) => {
        bobDispatchCalls.push(message.id);
        return { reply: { ok: true } };
      },
    });

    const connectionId = 'conn_revoke_in_flight';
    const baseToken: Omit<ConnectionToken, 'subject' | 'audience'> = {
      connection_id: connectionId,
      issuer: aliceOwner.did,
      purpose: 'test:revoke-in-flight',
      cedar_policies: [
        `permit (
          principal == Agent::"${pair.alice.did}",
          action == Action::"read",
          resource in Project::"alpha"
        );`,
      ],
      obligations: [],
      scope_catalog_version: 'v1',
      expires: '2099-01-01T00:00:00Z',
      sigs: { [aliceOwner.did]: 'sig-a', [bobOwner.did]: 'sig-b' },
    };
    await pair.alice.runtime.addConnection({
      ...baseToken,
      subject: pair.alice.did,
      audience: pair.bob.did,
    });
    await pair.bob.runtime.addConnection({
      ...baseToken,
      subject: pair.bob.did,
      audience: pair.alice.did,
    });

    // Pre-revoke: Alice sends an allowed read.
    await pair.alice.runtime.transport.send(pair.bob.did, {
      id: 'msg-pre-revoke',
      type: 'https://didcomm.org/arp/1.0/request',
      from: pair.alice.did,
      to: [pair.bob.did],
      body: {
        connection_id: connectionId,
        action: 'read',
        resource: 'Project:alpha',
      },
    });
    await pair.alice.drainAll();

    // Bob's owner revokes the connection. (This is the "revoke" in the
    // sense the brief describes: the user invoking the runtime API
    // mid-conversation.)
    await pair.bob.runtime.revokeConnection(connectionId, 'owner_revoked_in_flight');

    // Post-revoke: Alice fires another message — she has no signal yet
    // that Bob revoked.
    await pair.alice.runtime.transport.send(pair.bob.did, {
      id: 'msg-post-revoke',
      type: 'https://didcomm.org/arp/1.0/request',
      from: pair.alice.did,
      to: [pair.bob.did],
      body: {
        connection_id: connectionId,
        action: 'read',
        resource: 'Project:alpha',
      },
    });
    await pair.alice.drainAll();

    // Dispatch fired exactly once (pre-revoke msg only).
    expect(bobDispatchCalls).toEqual(['msg-pre-revoke']);

    // Bob's audit: 2 entries — [allow, deny(revoked)]. Order matters.
    const bobAudit = pair.bob.runtime.auditFor(connectionId);
    expect(bobAudit.size).toBe(2);
    const verify = verifyAuditChain(bobAudit.path);
    expect(verify.valid).toBe(true);
    expect(verify.entriesSeen).toBe(2);

    const lines = readFileSync(bobAudit.path, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!) as {
      decision: string;
      msg_id: string;
      reason: string | null;
    };
    const second = JSON.parse(lines[1]!) as {
      decision: string;
      msg_id: string;
      reason: string | null;
    };
    expect(first.decision).toBe('allow');
    expect(first.msg_id).toBe('msg-pre-revoke');
    expect(second.decision).toBe('deny');
    expect(second.msg_id).toBe('msg-post-revoke');
    // The runtime stamps `connection_<status>` because revokeConnection
    // flips status to 'revoked' BEFORE the revocations-table check fires.
    expect(second.reason).toBe('connection_revoked');

    // Bob's deny reply for msg-post-revoke landed at Alice with
    // `decision: 'deny'`.
    const denyReply = pair.envelopeLog.find(
      (e) =>
        e.toDid === pair!.alice.did &&
        e.payload.from === pair!.bob.did &&
        e.payload.thid === 'msg-post-revoke',
    );
    expect(denyReply).toBeDefined();
    expect(denyReply!.payload.body?.['decision']).toBe('deny');
  });
});
