import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAuditLog, verifyAuditChain } from '../src/log.js';
import { GENESIS_PREV_HASH } from '../src/types.js';

const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'arp-audit-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe('openAuditLog', () => {
  it('writes genesis-linked entries with incrementing seq', () => {
    const dir = tempDir();
    const log = openAuditLog({ connectionId: 'conn_test', dir });
    const first = log.append({
      msg_id: 'm1',
      decision: 'allow',
      policies_fired: ['p_test'],
    });
    expect(first.seq).toBe(0);
    expect(first.prev_hash).toBe(GENESIS_PREV_HASH);

    const second = log.append({
      msg_id: 'm2',
      decision: 'deny',
      policies_fired: ['p_forbid'],
      reason: 'forbidden',
    });
    expect(second.seq).toBe(1);
    expect(second.prev_hash).toBe(first.self_hash);
  });

  it('verifies a well-formed 100-entry chain', () => {
    const dir = tempDir();
    const log = openAuditLog({ connectionId: 'conn_big', dir });
    for (let i = 0; i < 100; i++) {
      log.append({
        msg_id: `m_${i}`,
        decision: i % 5 === 0 ? 'deny' : 'allow',
        policies_fired: [`p_${i % 3}`],
        spend_delta_cents: i,
      });
    }
    const r = verifyAuditChain(log.path);
    expect(r.valid).toBe(true);
    expect(r.entriesSeen).toBe(100);
  });

  it('detects tampered entries via firstBreakAt', () => {
    const dir = tempDir();
    const log = openAuditLog({ connectionId: 'conn_tamper', dir });
    for (let i = 0; i < 10; i++) {
      log.append({ msg_id: `m_${i}`, decision: 'allow', policies_fired: [] });
    }
    const raw = readFileSync(log.path, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const parsed = JSON.parse(lines[5]!);
    parsed.decision = 'deny';
    lines[5] = JSON.stringify(parsed);
    writeFileSync(log.path, lines.join('\n') + '\n');

    const r = verifyAuditChain(log.path);
    expect(r.valid).toBe(false);
    expect(r.firstBreakAt).toBe(5);
  });

  it('resumes seq + prev_hash across reopen', () => {
    const dir = tempDir();
    const log1 = openAuditLog({ connectionId: 'conn_reopen', dir });
    const a = log1.append({ msg_id: 'a', decision: 'allow', policies_fired: [] });
    const b = log1.append({ msg_id: 'b', decision: 'allow', policies_fired: [] });

    const log2 = openAuditLog({ connectionId: 'conn_reopen', dir });
    const c = log2.append({ msg_id: 'c', decision: 'allow', policies_fired: [] });

    expect(c.seq).toBe(2);
    expect(c.prev_hash).toBe(b.self_hash);
    const r = verifyAuditChain(log2.path);
    expect(r.valid).toBe(true);
    expect(r.entriesSeen).toBe(3);
    expect(a.seq).toBe(0);
  });

  it('injected clock drives the timestamp', () => {
    const dir = tempDir();
    const fixed = new Date('2026-04-22T12:00:00.000Z');
    const log = openAuditLog({ connectionId: 'conn_clock', dir, now: () => fixed });
    const e = log.append({ msg_id: 'm1', decision: 'allow', policies_fired: [] });
    expect(e.timestamp).toBe('2026-04-22T12:00:00.000Z');
  });

  it('verifyAuditChain on missing file returns valid=true, 0 entries', () => {
    const dir = tempDir();
    const r = verifyAuditChain(join(dir, 'nope.jsonl'));
    expect(r.valid).toBe(true);
    expect(r.entriesSeen).toBe(0);
  });
});
