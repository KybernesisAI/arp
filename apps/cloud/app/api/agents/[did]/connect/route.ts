/**
 * POST /api/agents/[did]/connect { url }   (AgentID S6a — zero-code connect)
 *
 * One action for the owner: the console creates the runtime link + a
 * single-use ticket and hands the ticket to the gateway, which signs the
 * connect token, pushes it to the runtime, serves the runtime's redemption,
 * and verifies the identity document — all inside this request. The owner
 * never sees a variable or a second step.
 *
 * Returns the gateway's owner-grade outcome. `connected` also rebuilds the
 * name's public documents so the runtime service shows up immediately.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { LinkError, makeChallenge, normalizeLinkValue, rebuildWellKnown } from '@/lib/links';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';

const Body = z.object({ url: z.string().min(1).max(512) });

export function gatewayOrigin(): string {
  return (process.env['ARP_CLOUD_PUSH_ISSUER'] ?? 'https://gateway.arp.run').replace(/\/+$/, '');
}

/** Turn what an owner types into the runtime URL the add-on serves. */
export function runtimeUrlFrom(input: string): string {
  let v = input.trim();
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  const u = new URL(v);
  u.hash = '';
  u.search = '';
  let path = u.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/eve/v1/arp')) path = `${path}/eve/v1/arp`;
  u.pathname = path;
  return u.toString();
}

export async function POST(req: Request, ctx: { params: Promise<{ did: string }> }): Promise<Response> {
  try {
    const { tenantDb, session } = await requireTenantDb();
    const { did: rawDid } = await ctx.params;
    const agentDid = decodeURIComponent(rawDid);
    const agent = await tenantDb.getAgent(agentDid);
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (agent.keyCustody !== 'cloud') {
      return NextResponse.json({ error: 'key_exported', result: 'key_exported', message: 'Host this name’s key here first (button above), then connect your agent.' }, { status: 409 });
    }
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request', message: 'Enter your agent’s address.' }, { status: 400 });

    let value: string;
    try {
      value = normalizeLinkValue('runtime', runtimeUrlFrom(parsed.data.url));
    } catch (err) {
      if (err instanceof LinkError || err instanceof TypeError) {
        return NextResponse.json({ error: 'bad_url', result: 'bad_url', message: 'That does not look like an address. Use the https:// address where your agent runs.' }, { status: 400 });
      }
      throw err;
    }

    // One runtime link per URL; a fresh challenge every connect so a token
    // minted for an earlier attempt can never satisfy this one.
    const existing = (await tenantDb.listLinks(agentDid, { includeRevoked: true })).find((l) => l.kind === 'runtime' && l.value === value);
    const link = existing
      ? ((await tenantDb.updateLink(existing.id, { status: 'pending', challenge: makeChallenge(), revokedAt: null })) ?? existing)
      : await tenantDb.createLink({ agentDid, kind: 'runtime', value, label: 'eve', challenge: makeChallenge() });
    const ticket = await tenantDb.createConnectTicket({ agentDid, url: value, linkId: link.id });

    let outcome: { result: string; message: string; store?: string | null; detail?: string };
    let status = 200;
    try {
      const res = await fetch(`${gatewayOrigin()}/internal/connect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ ticket_id: ticket.id }),
        signal: AbortSignal.timeout(40_000),
      });
      status = res.status;
      outcome = (await res.json()) as typeof outcome;
    } catch (err) {
      console.error('[agents/connect] gateway unreachable', (err as Error).message);
      return NextResponse.json({ result: 'service_unavailable', message: 'We could not complete the connection right now. Try again in a minute.' }, { status: 503 });
    }

    if (outcome.result === 'connected') {
      await rebuildWellKnown(tenantDb, agentDid);
      track({ distinctId: session.principalDid, event: 'agentid_agent_connected', properties: { tenant_id: tenantDb.tenantId, agent_did: agentDid, store: outcome.store ?? null } });
      return NextResponse.json({ ok: true, result: 'connected', message: outcome.message, url: value, push_url: new URL(value).origin, store: outcome.store ?? null });
    }
    track({ distinctId: session.principalDid, event: 'agentid_agent_connect_failed', properties: { tenant_id: tenantDb.tenantId, agent_did: agentDid, result: outcome.result } });
    return NextResponse.json(
      { ok: false, result: outcome.result, message: outcome.message, ...(outcome.detail ? { detail: outcome.detail } : {}), url: value },
      { status: status >= 400 ? status : 400 },
    );
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    console.error('[agents/connect POST]', err);
    return NextResponse.json({ result: 'internal', message: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}
