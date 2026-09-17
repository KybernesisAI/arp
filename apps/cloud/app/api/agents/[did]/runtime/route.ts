/**
 * POST   /api/agents/[did]/runtime  { url, kind: 'eve'|'generic' }  — attach a runtime (AgentID S4 / P6)
 * DELETE /api/agents/[did]/runtime                                   — detach
 *
 * Attach = a verified runtime link (S3 challenge at
 * <url>/.well-known/agentid-verification) + push config on the identity +
 * an agent credential minted once for the runtime to call the gateway's
 * agent-API. The identity must be in cloud custody (the gateway signs for it).
 */

import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { env } from '@/lib/env';
import { LinkError, makeChallenge, normalizeLinkValue, rebuildWellKnown, verifyFetchedLinkProof } from '@/lib/links';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';

const Body = z.object({
  url: z.string().min(1).max(512),
  kind: z.enum(['eve', 'generic']).default('eve'),
});

export async function POST(req: Request, ctx: { params: Promise<{ did: string }> }): Promise<Response> {
  try {
    const { tenantDb, session } = await requireTenantDb();
    const { did: rawDid } = await ctx.params;
    const agentDid = decodeURIComponent(rawDid);
    const agent = await tenantDb.getAgent(agentDid);
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (agent.keyCustody !== 'cloud') {
      return NextResponse.json(
        { error: 'key_exported', message: 'This name’s key was exported. Hosted delivery needs the key held for you; re-provision to attach a runtime.' },
        { status: 409 },
      );
    }
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues }, { status: 400 });

    let value: string;
    try {
      value = normalizeLinkValue('runtime', parsed.data.url);
    } catch (err) {
      if (err instanceof LinkError) return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
      throw err;
    }

    // One runtime link per URL; a fresh challenge unless already verified.
    const existing = (await tenantDb.listLinks(agentDid, { includeRevoked: true })).find((l) => l.kind === 'runtime' && l.value === value);
    // A pending link keeps its challenge so the runtime can converge on it
    // across attempts; only a revoked link gets a fresh one.
    let link = existing
      ? (await tenantDb.updateLink(existing.id, {
          status: existing.status === 'verified' ? 'verified' : 'pending',
          challenge: existing.status === 'revoked' ? makeChallenge() : existing.challenge,
          revokedAt: null,
        })) ?? existing
      : await tenantDb.createLink({ agentDid, kind: 'runtime', value, label: parsed.data.kind, challenge: makeChallenge() });

    if (link.status !== 'verified') {
      try {
        const proof = await verifyFetchedLinkProof(link);
        link = (await tenantDb.updateLink(link.id, { status: 'verified', proofJson: proof, verifiedAt: new Date() })) ?? link;
      } catch (err) {
        if (err instanceof LinkError) {
          return NextResponse.json(
            {
              error: err.code,
              message: err.message,
              challenge: link.challenge,
              expected: { did: agentDid, challenge: link.challenge },
              verification_url: `${value}/.well-known/agentid-verification`,
            },
            { status: err.code === 'unreachable' ? 502 : 400 },
          );
        }
        throw err;
      }
    }

    // For Eve runtimes the session API lives at the origin; the link URL may
    // point at the channel path (…/eve/v1/arp) that serves the verification doc.
    const pushUrl = parsed.data.kind === 'eve' ? new URL(value).origin : value;
    await tenantDb.updateAgent(agentDid, { runtimeKind: 'push', pushUrl, pushKind: parsed.data.kind });
    await rebuildWellKnown(tenantDb, agentDid);

    await tenantDb.revokeAgentCredentials(agentDid);
    const token = randomBytes(32).toString('base64url');
    await tenantDb.createAgentCredential({ agentDid, tokenHash: createHash('sha256').update(token).digest('hex'), label: parsed.data.kind });

    track({
      distinctId: session.principalDid,
      event: 'agentid_runtime_attached',
      properties: { tenant_id: tenantDb.tenantId, agent_did: agentDid, kind: parsed.data.kind },
    });
    const issuer = process.env['ARP_CLOUD_PUSH_ISSUER'] ?? 'https://gateway.arp.run';
    return NextResponse.json({
      ok: true,
      agent_did: agentDid,
      runtime_kind: 'push',
      push_kind: parsed.data.kind,
      push_url: pushUrl,
      credential: token,
      env: {
        ARP_ISSUER: issuer,
        ARP_AGENT_DID: agentDid,
        ARP_AGENT_CREDENTIAL: token,
        AGENTID_CHALLENGE: link.challenge,
      },
      mirror: `https://${agentDid.replace(/^did:web:/, '').replace(/\.agent$/, '')}${env().AGENTID_MIRROR_SUFFIX}`,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    console.error('[agents/runtime POST]', err);
    return NextResponse.json({ error: 'internal', message: 'The runtime could not be attached.' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ did: string }> }): Promise<Response> {
  try {
    const { tenantDb, session } = await requireTenantDb();
    const { did: rawDid } = await ctx.params;
    const agentDid = decodeURIComponent(rawDid);
    const agent = await tenantDb.getAgent(agentDid);
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await tenantDb.updateAgent(agentDid, { runtimeKind: 'none', pushUrl: null, pushKind: null });
    const revoked = await tenantDb.revokeAgentCredentials(agentDid);
    for (const l of await tenantDb.listLinks(agentDid)) {
      if (l.kind === 'runtime') await tenantDb.updateLink(l.id, { status: 'revoked', revokedAt: new Date() });
    }
    await rebuildWellKnown(tenantDb, agentDid);
    track({ distinctId: session.principalDid, event: 'agentid_runtime_detached', properties: { tenant_id: tenantDb.tenantId, agent_did: agentDid, credentials_revoked: revoked } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
