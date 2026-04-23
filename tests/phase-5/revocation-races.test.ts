import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadScopesFromDirectory } from '@kybernesis/arp-scope-catalog';
import { createDualRuntime, type DualRuntime, SCOPES_DIR } from './helpers/dual-runtime.js';
import { pair } from './helpers/pair.js';

/**
 * Phase-5 Task 7 — revocation race.
 *
 * Per-run flow (100 runs):
 *   1. Pair Samantha ↔ Ghost with a tiny read-only scope
 *   2. Ghost begins sending messages
 *   3. After N messages, revoke via admin API
 *   4. Continue sending a handful of further messages
 *   5. Drain, verify audit + registry agree:
 *        - every allowed entry occurred BEFORE the revocation
 *        - every deny-with-reason=revoked entry is AFTER
 *        - registry shows status=revoked + revocation list contains the id
 */

const RUNS = Number(process.env.PHASE5_REVOCATION_RUNS ?? 100);

describe('phase 5 — revocation races', () => {
  let harness: DualRuntime;

  beforeEach(async () => {
    harness = await createDualRuntime();
  });

  afterEach(async () => {
    await harness.close();
  });

  it(`audit + registry stay consistent across ${RUNS} revocation races`, async () => {
    const catalog = loadScopesFromDirectory(SCOPES_DIR);

    for (let run = 0; run < RUNS; run++) {
      const { connectionId } = await pair({
        catalog,
        issuerPrincipal: harness.ianPrincipal,
        issuerAgentDid: 'did:web:samantha.agent',
        counterpartyPrincipal: harness.nickPrincipal,
        counterpartyAgentDid: 'did:web:ghost.agent',
        purpose: `revocation-race-${run}`,
        scopeSelections: [{ id: 'files.projects.list' }],
        adminToken: harness.adminToken,
        issuerPort: harness.samanthaPort,
        counterpartyPort: harness.ghostPort,
        resolver: harness.pairingResolver,
      });

      // 3 messages BEFORE revoke.
      for (let i = 0; i < 3; i++) {
        await harness.ghost.transport.send('did:web:samantha.agent', {
          id: `pre-${run}-${i}`,
          type: 'https://didcomm.org/arp/1.0/request',
          from: 'did:web:ghost.agent',
          to: ['did:web:samantha.agent'],
          body: {
            connection_id: connectionId,
            action: 'list',
            resource: 'ProjectRegistry:self',
          },
        });
      }
      await harness.fullyDrain();

      // Revoke.
      await harness.samantha.revokeConnection(connectionId, 'race-test');

      // 3 messages AFTER revoke.
      for (let i = 0; i < 3; i++) {
        await harness.ghost.transport.send('did:web:samantha.agent', {
          id: `post-${run}-${i}`,
          type: 'https://didcomm.org/arp/1.0/request',
          from: 'did:web:ghost.agent',
          to: ['did:web:samantha.agent'],
          body: {
            connection_id: connectionId,
            action: 'list',
            resource: 'ProjectRegistry:self',
          },
        });
      }
      await harness.fullyDrain();

      const log = harness.samantha.auditFor(connectionId);
      const entries = readEntries(log.path);

      const preEntries = entries.filter((e) => e.msg_id.startsWith(`pre-${run}-`));
      const postEntries = entries.filter((e) => e.msg_id.startsWith(`post-${run}-`));

      expect(preEntries, `run ${run} preEntries`).toHaveLength(3);
      expect(postEntries, `run ${run} postEntries`).toHaveLength(3);
      for (const e of preEntries) {
        expect(e.decision, `run ${run}: pre-revoke entry ${e.msg_id}`).toBe('allow');
      }
      for (const e of postEntries) {
        expect(e.decision, `run ${run}: post-revoke entry ${e.msg_id}`).toBe('deny');
        expect(e.reason, `run ${run}: post-revoke reason`).toMatch(/revoked/i);
      }

      // Registry agrees.
      const record = await harness.samantha.registry.getConnection(connectionId);
      expect(record, `run ${run} record`).not.toBeNull();
      expect(record?.status, `run ${run} status`).toBe('revoked');
      expect(
        await harness.samantha.registry.isRevoked('connection', connectionId),
        `run ${run} isRevoked`,
      ).toBe(true);

      // Audit chain still verifies.
      const verify = log.verify();
      expect(verify.valid, `run ${run} audit chain`).toBe(true);
    }
  });
});

function readEntries(path: string): Array<{
  msg_id: string;
  decision: 'allow' | 'deny';
  reason: string | null;
}> {
  const raw = readFileSync(path, 'utf8');
  return raw
    .split('\n')
    .filter((l) => l.trim())
    .map(
      (l) =>
        JSON.parse(l) as {
          msg_id: string;
          decision: 'allow' | 'deny';
          reason: string | null;
        },
    );
}
