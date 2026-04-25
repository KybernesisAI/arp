/**
 * Phase 10 slice 10e — A4: post-pair message round-trip.
 *
 * After a pairing seeds both sides with the same Connection Token, A and
 * B exchange messages in both directions through the PDP. Each request
 * lands as an audit entry on the receiving side, and each reply is
 * dispatched back to the sender. The dispatch handler is invoked exactly
 * once per allowed request — we wire counters to prove it.
 *
 *   Alice → Bob   (bob audits + dispatches reply to alice)
 *   Bob → Alice   (alice audits + dispatches reply to bob)
 *
 * Both audit chains must verify cleanly via `verifyAuditChain`.
 */

import { describe, it, expect, afterEach } from 'vitest';
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

describe('Phase 10/10e — post-pair message round-trip', () => {
  it('exchanges a request + reply each direction; both audits remain verifiable', async () => {
    const aliceOwner = await resolvePrincipal(71);
    const bobOwner = await resolvePrincipal(73);
    const aliceDispatchCalls: Array<{
      from: string;
      action: unknown;
    }> = [];
    const bobDispatchCalls: Array<{
      from: string;
      action: unknown;
    }> = [];

    pair = await bootSidecarPair({
      aliceDid: 'did:web:alice-msg.agent',
      bobDid: 'did:web:bob-msg.agent',
      alicePrincipalDid: aliceOwner.did,
      bobPrincipalDid: bobOwner.did,
      aliceDispatch: async ({ message }) => {
        aliceDispatchCalls.push({
          from: (message as { from: string }).from,
          action: (message.body as { action?: unknown })?.action,
        });
        return { reply: { ok: true, by: 'alice' } };
      },
      bobDispatch: async ({ message }) => {
        bobDispatchCalls.push({
          from: (message as { from: string }).from,
          action: (message.body as { action?: unknown })?.action,
        });
        return { reply: { ok: true, by: 'bob' } };
      },
    });

    const connectionId = 'conn_msg_roundtrip';
    // Symmetric connection token — both sides hold identical scope policies
    // permitting `read` against `Project::"alpha"` from the other agent.
    const baseToken: Omit<ConnectionToken, 'subject' | 'audience'> = {
      connection_id: connectionId,
      issuer: aliceOwner.did,
      purpose: 'test:msg-roundtrip',
      cedar_policies: [
        `permit (
          principal == Agent::"${pair.bob.did}",
          action == Action::"read",
          resource in Project::"alpha"
        );`,
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

    // Alice → Bob
    await pair.alice.runtime.transport.send(pair.bob.did, {
      id: 'msg-a-to-b-1',
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

    // Bob → Alice
    await pair.bob.runtime.transport.send(pair.alice.did, {
      id: 'msg-b-to-a-1',
      type: 'https://didcomm.org/arp/1.0/request',
      from: pair.bob.did,
      to: [pair.alice.did],
      body: {
        connection_id: connectionId,
        action: 'read',
        resource: 'Project:alpha',
      },
    });
    await pair.alice.drainAll();

    // Each dispatch handler fired exactly once (its own inbound request).
    expect(bobDispatchCalls).toHaveLength(1);
    expect(bobDispatchCalls[0]?.from).toBe(pair.alice.did);
    expect(bobDispatchCalls[0]?.action).toBe('read');
    expect(aliceDispatchCalls).toHaveLength(1);
    expect(aliceDispatchCalls[0]?.from).toBe(pair.bob.did);
    expect(aliceDispatchCalls[0]?.action).toBe('read');

    // Both audit chains have exactly one allow entry and verify cleanly.
    const aliceAudit = pair.alice.runtime.auditFor(connectionId);
    const bobAudit = pair.bob.runtime.auditFor(connectionId);
    expect(aliceAudit.size).toBe(1);
    expect(bobAudit.size).toBe(1);

    const aliceVerify = verifyAuditChain(aliceAudit.path);
    const bobVerify = verifyAuditChain(bobAudit.path);
    expect(aliceVerify.valid).toBe(true);
    expect(aliceVerify.entriesSeen).toBe(1);
    expect(bobVerify.valid).toBe(true);
    expect(bobVerify.entriesSeen).toBe(1);
  });
});
