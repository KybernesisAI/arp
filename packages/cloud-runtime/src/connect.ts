/**
 * AgentID S6a: zero-code connect — the gateway's half of the token exchange.
 *
 *   console ──POST /internal/connect {ticket_id}──▶ gateway
 *   gateway ──POST <url>/connect {token}──────────▶ runtime
 *   runtime ──POST /agent-api/bootstrap (bearer)──▶ gateway   (inside its /connect handler)
 *   gateway ◀── { did, issuer, credential, challenge } ── runtime persists it
 *   gateway ──GET <url>/.well-known/agentid-verification──▶ runtime  (must match)
 *
 * The ticket row (created by the console, single use, 5 minutes) is the
 * console → gateway authorization; the connect token (ES256, signed by the
 * push signer, `aud` = the runtime's origin, `jti` = the ticket) is the
 * gateway → runtime authorization; the runtime never needs a secret typed by
 * a person. First bind wins: a URL origin already bound to another tenant's
 * agent cannot be connected.
 */

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { SignJWT, createLocalJWKSet, jwtVerify, type JWK } from 'jose';
import { agentConnectTickets, agentCredentials, agentLinks, agents, type CloudDbClient } from '@kybernesis/arp-cloud-db';
import type { PushContext } from './push.js';
import type { CloudRuntimeLogger } from './types.js';

export type ConnectResult =
  | 'connected'
  | 'invalid_ticket'
  | 'expired'
  | 'bound_elsewhere'
  | 'not_reachable'
  | 'not_arp_ready'
  | 'store_unwritable'
  | 'runtime_error'
  | 'verification_failed';

export interface ConnectOutcome {
  result: ConnectResult;
  did: string | null;
  url: string | null;
  /** Owner-grade sentence for the console. */
  message: string;
  detail?: string;
  /** What the runtime reported about where it keeps its identity (file | env | none). */
  store?: string | null;
}

export interface ConnectContext {
  db: CloudDbClient;
  push: PushContext;
  logger: CloudRuntimeLogger;
  now?: () => number;
  /** Per-call timeout for the runtime (ms). Default 10 s. */
  timeoutMs?: number;
}

const MESSAGES: Record<ConnectResult, string> = {
  connected: 'Connected. Your agent now answers to this name.',
  invalid_ticket: 'This connection attempt is no longer valid. Try again.',
  expired: 'This connection attempt timed out. Try again.',
  bound_elsewhere: 'That agent is already connected to a name on a different account.',
  not_reachable: 'We could not reach your agent at that address. Check the URL and that it is online.',
  not_arp_ready: 'Your agent is online but does not have the agent-network add-on yet.',
  store_unwritable: 'Your agent could not save its identity. Its host has no writable storage; use the manual setup below.',
  runtime_error: 'Your agent answered with an error while connecting.',
  verification_failed: 'Your agent connected but did not confirm its identity. Try again.',
};

function outcome(result: ConnectResult, did: string | null, url: string | null, extra: Partial<ConnectOutcome> = {}): ConnectOutcome {
  return { result, did, url, message: MESSAGES[result], ...extra };
}

async function fetchWithTimeout(fetchImpl: typeof fetch, input: string, init: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetchImpl(input, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Sign the connect token the runtime redeems. */
export async function mintConnectToken(
  ctx: ConnectContext,
  claims: { ticketId: string; did: string; url: string; challenge: string },
  ttlSeconds = 300,
): Promise<string> {
  const origin = new URL(claims.url).origin;
  return new SignJWT({ kind: 'arp-connect', did: claims.did, url: claims.url, challenge: claims.challenge })
    .setProtectedHeader({ alg: 'ES256', kid: ctx.push.signer.kid, typ: 'JWT' })
    .setIssuer(ctx.push.issuer)
    .setAudience(origin)
    .setSubject(claims.did)
    .setJti(claims.ticketId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(ctx.push.signer.privateKey);
}

/** Console → gateway: run the whole exchange for one ticket. */
export async function handleInternalConnect(ctx: ConnectContext, ticketId: string): Promise<{ status: number; body: ConnectOutcome }> {
  const now = ctx.now ?? (() => Date.now());
  const timeoutMs = ctx.timeoutMs ?? 10_000;
  const fetchImpl = ctx.push.fetchImpl ?? globalThis.fetch;
  const log = ctx.logger.child ? ctx.logger.child({ ticketId }) : ctx.logger;

  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return { status: 400, body: outcome('invalid_ticket', null, null) };
  const ticket = (await ctx.db.select().from(agentConnectTickets).where(eq(agentConnectTickets.id, ticketId)).limit(1))[0];
  if (!ticket || ticket.usedAt) return { status: 409, body: outcome('invalid_ticket', null, null) };
  if (ticket.expiresAt.getTime() < now()) return { status: 410, body: outcome('expired', ticket.agentDid, ticket.url) };

  const agent = (await ctx.db.select().from(agents).where(and(eq(agents.did, ticket.agentDid), eq(agents.tenantId, ticket.tenantId))).limit(1))[0];
  if (!agent) return { status: 409, body: outcome('invalid_ticket', ticket.agentDid, ticket.url) };

  let origin: string;
  try {
    origin = new URL(ticket.url).origin;
  } catch {
    return { status: 400, body: outcome('not_reachable', ticket.agentDid, ticket.url) };
  }

  const finish = async (result: ConnectResult, extra: Partial<ConnectOutcome> = {}, status = 200) => {
    await ctx.db.update(agentConnectTickets).set({ usedAt: sql`now()`, result }).where(eq(agentConnectTickets.id, ticket.id));
    return { status, body: outcome(result, ticket.agentDid, ticket.url, extra) };
  };

  // First bind wins: the origin may only be bound to agents of this tenant.
  const elsewhere = await ctx.db
    .select({ did: agents.did })
    .from(agents)
    .where(and(eq(agents.pushUrl, origin), ne(agents.tenantId, ticket.tenantId)))
    .limit(1);
  if (elsewhere[0]) {
    log.warn({ url: ticket.url, boundTo: elsewhere[0].did }, 'connect_bound_elsewhere');
    return finish('bound_elsewhere', {}, 409);
  }

  const link = ticket.linkId ? (await ctx.db.select().from(agentLinks).where(eq(agentLinks.id, ticket.linkId)).limit(1))[0] : undefined;
  if (!link) return finish('invalid_ticket', { detail: 'no runtime link for ticket' }, 409);

  const token = await mintConnectToken(ctx, { ticketId: ticket.id, did: ticket.agentDid, url: ticket.url, challenge: link.challenge });

  // Hand the token to the runtime; it redeems it at /agent-api/bootstrap
  // (below) before answering, so this call completes the whole exchange.
  let res: Response;
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      `${ticket.url.replace(/\/+$/, '')}/connect`,
      { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ token, issuer: ctx.push.issuer }) },
      timeoutMs,
    );
  } catch (err) {
    log.info({ url: ticket.url, err: (err as Error).message }, 'connect_not_reachable');
    return finish('not_reachable', { detail: (err as Error).message }, 502);
  }
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; did?: string; error?: string; store?: string; message?: string };
  if (res.status === 404 || res.status === 405) return finish('not_arp_ready', {}, 424);
  if (res.status === 409) return finish('bound_elsewhere', { detail: body.error ?? body.message }, 409);
  if (res.status === 503 && (body.store === 'none' || body.error === 'store_unwritable')) return finish('store_unwritable', { store: 'none' }, 424);
  if (!res.ok || body.ok === false) {
    log.info({ url: ticket.url, status: res.status, body }, 'connect_runtime_error');
    return finish('runtime_error', { detail: body.error ?? body.message ?? `HTTP ${res.status}` }, 502);
  }

  // The runtime says it is configured; make it prove it the same way the
  // manual path does.
  let doc: { did?: string; challenge?: string } = {};
  try {
    const v = await fetchWithTimeout(fetchImpl, `${ticket.url.replace(/\/+$/, '')}/.well-known/agentid-verification`, { headers: { accept: 'application/json' } }, timeoutMs);
    doc = (await v.json().catch(() => ({}))) as typeof doc;
  } catch (err) {
    return finish('verification_failed', { detail: (err as Error).message }, 502);
  }
  if (doc.did !== ticket.agentDid || doc.challenge !== link.challenge) {
    return finish('verification_failed', { detail: 'verification document did not match' }, 409);
  }

  await ctx.db
    .update(agentLinks)
    .set({ status: 'verified', verifiedAt: sql`now()`, revokedAt: null, proofJson: { did: doc.did, challenge: doc.challenge, via: 'connect', store: body.store ?? null } })
    .where(eq(agentLinks.id, link.id));
  log.info({ agentDid: ticket.agentDid, url: ticket.url, store: body.store ?? null }, 'connect_completed');
  return finish('connected', { store: body.store ?? null });
}

/** Runtime → gateway: redeem a connect token for the agent's configuration. */
export async function handleBootstrap(
  ctx: ConnectContext,
  authorization: string | undefined,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const now = ctx.now ?? (() => Date.now());
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return { status: 401, body: { error: 'unauthorized' } };
  let payload: { kind?: unknown; did?: unknown; url?: unknown; challenge?: unknown; jti?: string; aud?: string | string[] };
  try {
    const keys = createLocalJWKSet({ keys: ctx.push.signer.jwks.keys as JWK[] });
    ({ payload } = await jwtVerify(token, keys, { issuer: ctx.push.issuer }));
  } catch {
    return { status: 401, body: { error: 'invalid_token' } };
  }
  if (payload.kind !== 'arp-connect' || typeof payload.did !== 'string' || typeof payload.url !== 'string' || typeof payload.challenge !== 'string' || !payload.jti) {
    return { status: 401, body: { error: 'invalid_token' } };
  }
  const ticket = (await ctx.db.select().from(agentConnectTickets).where(eq(agentConnectTickets.id, payload.jti)).limit(1))[0];
  if (!ticket || ticket.agentDid !== payload.did || ticket.url !== payload.url) return { status: 401, body: { error: 'invalid_token' } };
  if (ticket.result !== null || ticket.usedAt) return { status: 409, body: { error: 'token_used', message: 'This connect token was already redeemed.' } };
  if (ticket.expiresAt.getTime() < now()) return { status: 410, body: { error: 'token_expired' } };

  // Single use: claim it before minting anything.
  const claimed = await ctx.db
    .update(agentConnectTickets)
    .set({ result: 'bootstrapped' })
    .where(and(eq(agentConnectTickets.id, ticket.id), sql`${agentConnectTickets.result} IS NULL`))
    .returning({ id: agentConnectTickets.id });
  if (!claimed[0]) return { status: 409, body: { error: 'token_used' } };

  const origin = new URL(ticket.url).origin;
  await ctx.db
    .update(agentCredentials)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(agentCredentials.agentDid, ticket.agentDid), eq(agentCredentials.tenantId, ticket.tenantId)));
  const credential = randomBytes(32).toString('base64url');
  await ctx.db.insert(agentCredentials).values({
    tenantId: ticket.tenantId,
    agentDid: ticket.agentDid,
    tokenHash: createHash('sha256').update(credential).digest('hex'),
    label: 'connect',
  });
  await ctx.db
    .update(agents)
    .set({ runtimeKind: 'push', pushUrl: origin, pushKind: 'eve' })
    .where(and(eq(agents.did, ticket.agentDid), eq(agents.tenantId, ticket.tenantId)));
  ctx.logger.info({ agentDid: ticket.agentDid, url: ticket.url }, 'connect_bootstrapped');
  return {
    status: 200,
    body: { did: ticket.agentDid, issuer: ctx.push.issuer, credential, challenge: payload.challenge, push_url: origin },
  };
}
