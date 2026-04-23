/**
 * The Postgres audit writer must produce the same hash chain semantics as
 * the file-backed audit log: sequential seq numbers starting at 0, each
 * entry's prev_hash == previous entry's self_hash, self_hash ==
 * SHA-256(JCS(entry − self_hash)).
 *
 * We verify by writing 10 entries and asking `verify()` to walk the chain.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestHarness, type TestHarness } from './helpers.js';

describe('postgres audit hash chain', () => {
  let h: TestHarness;

  beforeEach(async () => {
    h = await createTestHarness();
  });

  afterEach(async () => {
    await h.closeDb();
  });

  it('writes a chain of 10 entries and verifies clean', async () => {
    await h.createActiveConnection('conn_x001');
    for (let i = 0; i < 10; i++) {
      await h.audit.append({
        agentDid: h.agentDid,
        connectionId: 'conn_x001',
        msgId: `msg-${i}`,
        decision: i % 3 === 0 ? 'deny' : 'allow',
        obligations: [],
        policiesFired: [],
      });
    }
    const count = await h.audit.count(h.agentDid, 'conn_x001');
    expect(count).toBe(10);
    const verify = await h.audit.verify(h.agentDid, 'conn_x001');
    expect(verify.valid).toBe(true);
    expect(verify.entriesSeen).toBe(10);
  });

  it('audit entries scoped per agent+connection, seq restarts per connection', async () => {
    await h.createActiveConnection('conn_c001');
    await h.createActiveConnection('conn_c002');
    for (let i = 0; i < 3; i++) {
      await h.audit.append({
        agentDid: h.agentDid,
        connectionId: 'conn_c001',
        msgId: `a${i}`,
        decision: 'allow',
        obligations: [],
        policiesFired: [],
      });
    }
    for (let i = 0; i < 2; i++) {
      await h.audit.append({
        agentDid: h.agentDid,
        connectionId: 'conn_c002',
        msgId: `b${i}`,
        decision: 'allow',
        obligations: [],
        policiesFired: [],
      });
    }
    const c1 = await h.audit.list(h.agentDid, 'conn_c001');
    const c2 = await h.audit.list(h.agentDid, 'conn_c002');
    expect(c1.length).toBe(3);
    expect(c2.length).toBe(2);
    // Both chains independently valid.
    expect((await h.audit.verify(h.agentDid, 'conn_c001')).valid).toBe(true);
    expect((await h.audit.verify(h.agentDid, 'conn_c002')).valid).toBe(true);
  });
});
