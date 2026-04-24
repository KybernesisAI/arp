import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConnectionToken } from '@kybernesis/arp-spec';
import { openRegistry, RegistryError, type Registry } from '../src/index.js';

const SELF_DID = 'did:web:samantha.agent';
const PEER_DID = 'did:web:ghost.agent';

function token(overrides: Partial<ConnectionToken> = {}): ConnectionToken {
  return {
    connection_id: 'conn_alpha01',
    issuer: 'did:web:ian.example.agent',
    subject: SELF_DID,
    audience: PEER_DID,
    purpose: 'project:alpha',
    cedar_policies: [
      'permit (principal == Agent::"did:web:ghost.agent", action, resource);',
    ],
    obligations: [],
    scope_catalog_version: 'v1',
    expires: '2099-01-01T00:00:00Z',
    sigs: { ian: 'sigA', nick: 'sigB' },
    ...overrides,
  };
}

const openDirs: string[] = [];
const openRegistries: Registry[] = [];

function tempRegistry(opts?: { now?: () => number }): Registry {
  const dir = mkdtempSync(join(tmpdir(), 'arp-registry-'));
  openDirs.push(dir);
  const reg = openRegistry(join(dir, 'registry.sqlite'), opts ?? {});
  openRegistries.push(reg);
  return reg;
}

afterEach(() => {
  while (openRegistries.length) {
    const r = openRegistries.pop();
    try {
      r?.close();
    } catch {
      /* ignore */
    }
  }
  while (openDirs.length) {
    const d = openDirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe('openRegistry', () => {
  it('persists a connection across create → get', async () => {
    const reg = tempRegistry();
    const t = token();
    const created = await reg.createConnection({
      token: t,
      token_jws: JSON.stringify(t),
      self_did: SELF_DID,
      label: 'ghost for alpha',
    });
    expect(created.connection_id).toBe(t.connection_id);
    expect(created.peer_did).toBe(PEER_DID);
    expect(created.status).toBe('active');

    const fetched = await reg.getConnection(t.connection_id);
    expect(fetched).not.toBeNull();
    expect(fetched?.label).toBe('ghost for alpha');
    expect(fetched?.cedar_policies).toHaveLength(1);
  });

  it('rejects duplicate connection_ids', async () => {
    const reg = tempRegistry();
    const t = token();
    await reg.createConnection({ token: t, token_jws: JSON.stringify(t), self_did: SELF_DID });
    await expect(
      reg.createConnection({ token: t, token_jws: JSON.stringify(t), self_did: SELF_DID }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('filters by peer + status', async () => {
    const reg = tempRegistry();
    const t1 = token({ connection_id: 'conn_0001', audience: PEER_DID });
    const t2 = token({ connection_id: 'conn_0002', audience: 'did:web:other.agent' });
    await reg.createConnection({ token: t1, token_jws: JSON.stringify(t1), self_did: SELF_DID });
    await reg.createConnection({ token: t2, token_jws: JSON.stringify(t2), self_did: SELF_DID });
    const byPeer = await reg.listConnections({ peer_did: PEER_DID });
    expect(byPeer).toHaveLength(1);
    expect(byPeer[0]?.connection_id).toBe('conn_0001');
  });

  it('revokes a connection and records it as a revocation', async () => {
    const reg = tempRegistry();
    const t = token();
    await reg.createConnection({ token: t, token_jws: JSON.stringify(t), self_did: SELF_DID });
    await reg.revokeConnection(t.connection_id, 'user_requested');
    const fetched = await reg.getConnection(t.connection_id);
    expect(fetched?.status).toBe('revoked');
    const rev = await reg.listRevocations('connection');
    expect(rev).toHaveLength(1);
    expect(rev[0]?.reason).toBe('user_requested');
    expect(await reg.isRevoked('connection', t.connection_id)).toBe(true);
  });

  it('rejects revoke on missing connection', async () => {
    const reg = tempRegistry();
    await expect(reg.revokeConnection('conn_missing', 'x')).rejects.toBeInstanceOf(RegistryError);
  });

  it('sums spend within a rolling window', async () => {
    let t = 1_000_000_000_000;
    const reg = tempRegistry({ now: () => t });
    const tok = token();
    await reg.createConnection({ token: tok, token_jws: JSON.stringify(tok), self_did: SELF_DID });
    await reg.recordSpend(tok.connection_id, 200);
    t += 1000 * 60 * 5; // 5 min later
    await reg.recordSpend(tok.connection_id, 300);
    t += 1000 * 60 * 60 * 25; // +25h — outside 24h window from last insert
    await reg.recordSpend(tok.connection_id, 100);
    // 24h window at `t` should include only the most recent 100.
    const last24h = await reg.getSpendWindow(tok.connection_id, 60 * 60 * 24);
    expect(last24h).toBe(100);
    // 7-day window rolls in all three.
    const last7d = await reg.getSpendWindow(tok.connection_id, 60 * 60 * 24 * 7);
    expect(last7d).toBe(600);
  });

  it('rejects negative spend', async () => {
    const reg = tempRegistry();
    const t = token();
    await reg.createConnection({ token: t, token_jws: JSON.stringify(t), self_did: SELF_DID });
    await expect(reg.recordSpend(t.connection_id, -1)).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });

  it('records and enumerates key revocations independently', async () => {
    const reg = tempRegistry();
    await reg.recordRevocation({
      type: 'key',
      id: 'sha256:abc',
      reason: 'rotated',
    });
    expect(await reg.isRevoked('key', 'sha256:abc')).toBe(true);
    expect(await reg.isRevoked('connection', 'sha256:abc')).toBe(false);
    const all = await reg.listRevocations();
    expect(all).toHaveLength(1);
  });
});

describe('openRegistry persistence across restart', () => {
  it('survives close/reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arp-registry-'));
    openDirs.push(dir);
    const file = join(dir, 'registry.sqlite');

    const regA = openRegistry(file);
    const t = token();
    await regA.createConnection({
      token: t,
      token_jws: JSON.stringify(t),
      self_did: SELF_DID,
    });
    regA.close();

    const regB = openRegistry(file);
    openRegistries.push(regB);
    const again = await regB.getConnection(t.connection_id);
    expect(again?.peer_did).toBe(PEER_DID);
  });
});
