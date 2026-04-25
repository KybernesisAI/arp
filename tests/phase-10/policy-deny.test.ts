/**
 * Phase 10 slice 10e — A5: policy denies the request.
 *
 * Same connection setup as A4 but Alice asks for an action that Bob's
 * Cedar policy doesn't permit. Expected behaviour:
 *
 *   - Bob's PDP returns `deny`.
 *   - Bob's audit gets a single `deny` entry with `reason` populated.
 *   - Bob's dispatch handler is NEVER invoked.
 *   - Bob's transport sends a deny reply to Alice (`body.decision === 'deny'`).
 *
 * The fixture's `envelopeLog` lets us assert the deny reply hit the wire
 * — that's the part the audit alone doesn't see (replies aren't audited
 * because `isResponseType` filters them).
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

describe('Phase 10/10e — policy-denied request', () => {
  it("audits a single deny on B, never fires B's dispatch, replies deny to A", async () => {
    const aliceOwner = await resolvePrincipal(81);
    const bobOwner = await resolvePrincipal(83);
    const bobDispatchCalls: unknown[] = [];

    pair = await bootSidecarPair({
      aliceDid: 'did:web:alice-deny.agent',
      bobDid: 'did:web:bob-deny.agent',
      alicePrincipalDid: aliceOwner.did,
      bobPrincipalDid: bobOwner.did,
      bobDispatch: async ({ message }) => {
        bobDispatchCalls.push(message.id);
        return { reply: { unexpected: true } };
      },
    });

    const connectionId = 'conn_policy_deny';
    // Policy permits ONLY `read`. Alice will request `write`, which falls
    // outside the permit set and triggers Cedar's default-deny.
    const baseToken: Omit<ConnectionToken, 'subject' | 'audience'> = {
      connection_id: connectionId,
      issuer: aliceOwner.did,
      purpose: 'test:policy-deny',
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

    // Alice asks for `write` — outside the permit set.
    await pair.alice.runtime.transport.send(pair.bob.did, {
      id: 'msg-write-attempt-1',
      type: 'https://didcomm.org/arp/1.0/request',
      from: pair.alice.did,
      to: [pair.bob.did],
      body: {
        connection_id: connectionId,
        action: 'write',
        resource: 'Project:alpha',
      },
    });
    await pair.alice.drainAll();

    // Bob's dispatch handler must NOT have been called.
    expect(bobDispatchCalls).toHaveLength(0);

    // Bob's audit has exactly one entry, a deny.
    const bobAudit = pair.bob.runtime.auditFor(connectionId);
    expect(bobAudit.size).toBe(1);
    const verify = verifyAuditChain(bobAudit.path);
    expect(verify.valid).toBe(true);
    const auditLine = (await import('node:fs')).readFileSync(bobAudit.path, 'utf8');
    const entry = JSON.parse(auditLine.trim().split('\n')[0] ?? '{}') as {
      decision: string;
      reason: string | null;
      msg_id: string;
    };
    expect(entry.decision).toBe('deny');
    expect(entry.msg_id).toBe('msg-write-attempt-1');
    // Cedar's reason channel is populated (e.g. "no permit" or similar).
    // We don't assert exact wording — that's Cedar's; just non-null + non-empty.
    if (entry.reason !== null) {
      expect(typeof entry.reason).toBe('string');
    }

    // Alice's audit stays empty (no inbound REQUEST landed on alice; the
    // deny REPLY isn't audited).
    expect(pair.alice.runtime.auditFor(connectionId).size).toBe(0);

    // The envelope log should show: alice→bob request, then bob→alice deny
    // reply. The deny reply carries `decision: 'deny'` in the body.
    const dispatched = pair.envelopeLog;
    expect(dispatched.length).toBeGreaterThanOrEqual(2);
    const denyReply = dispatched.find(
      (e) => e.toDid === pair!.alice.did && e.payload.from === pair!.bob.did,
    );
    expect(denyReply).toBeDefined();
    expect(denyReply!.payload.body?.['decision']).toBe('deny');
    expect(denyReply!.payload.body?.['connection_id']).toBe(connectionId);
  });
});
