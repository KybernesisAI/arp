/**
 * Bearer-token verification for agent-authenticated HTTP endpoints.
 *
 * Mirrors the logic in ws-server.authenticate() so HTTP routes can
 * accept the same `<ts>.<sigB64>` bearer the WS connection uses. The
 * client side (cloud-client/src/auth.ts) signs:
 *
 *     sha256(`arp-cloud-ws:<agent-did>:<ts>`)
 *
 * with the agent's ed25519 private key. The token's `<ts>` must be
 * within `skewSec` of the server's clock to be valid.
 */

import { createHash } from 'node:crypto';
import * as ed25519 from '@noble/ed25519';
import { agents, type CloudDbClient } from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import { multibaseEd25519ToRaw } from '@kybernesis/arp-transport';

export interface BearerVerifyOptions {
  db: CloudDbClient;
  now: () => number;
  skewSec?: number;
}

export type BearerVerifyResult =
  | { ok: true; agentDid: string; tenantId: string }
  | { ok: false; status: number; reason: string };

export async function verifyAgentBearer(
  agentDid: string,
  bearer: string,
  opts: BearerVerifyOptions,
): Promise<BearerVerifyResult> {
  const skewSec = opts.skewSec ?? 300;
  const rows = await opts.db.select().from(agents).where(eq(agents.did, agentDid)).limit(1);
  const agentRow = rows[0];
  if (!agentRow) return { ok: false, status: 401, reason: 'unknown_agent' };
  const parts = bearer.split('.');
  if (parts.length !== 2) return { ok: false, status: 401, reason: 'bad_bearer_shape' };
  const [tsStr, sigB64] = parts as [string, string];
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return { ok: false, status: 401, reason: 'bad_bearer_ts' };
  const skewMs = Math.abs(opts.now() - ts);
  if (skewMs > skewSec * 1000) return { ok: false, status: 401, reason: 'bearer_expired' };
  let publicKey: Uint8Array;
  try {
    publicKey = multibaseEd25519ToRaw(agentRow.publicKeyMultibase);
  } catch {
    return { ok: false, status: 500, reason: 'malformed_agent_key' };
  }
  const challenge = createHash('sha256')
    .update(`arp-cloud-ws:${agentDid}:${ts}`)
    .digest();
  const sig = Buffer.from(sigB64, 'base64url');
  const ok = await ed25519.verifyAsync(
    new Uint8Array(sig),
    new Uint8Array(challenge),
    publicKey,
  );
  if (!ok) return { ok: false, status: 401, reason: 'bad_signature' };
  return { ok: true, agentDid, tenantId: agentRow.tenantId };
}
