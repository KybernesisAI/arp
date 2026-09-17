/**
 * POST /api/agents/[did]/export-key  (AgentID S2 / T9)
 *
 * Hand a cloud-custody identity's private key to its owner exactly once
 * and flip custody to `exported`. After this the cloud can no longer sign
 * for the agent (push mode stops); the owner runs it with the handoff.
 */

import { NextResponse } from 'next/server';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { env } from '@/lib/env';
import { exportPrivateKey, sealingKey } from '@/lib/key-custody';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ did: string }> }): Promise<Response> {
  try {
    const { tenantDb, session } = await requireTenantDb();
    const { did: rawDid } = await ctx.params;
    const agentDid = decodeURIComponent(rawDid);
    const agent = await tenantDb.getAgent(agentDid);
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (agent.keyCustody !== 'cloud') {
      return NextResponse.json({ error: 'already_exported', message: 'This key has already been exported.' }, { status: 409 });
    }
    const raw = await exportPrivateKey({
      tenantDb,
      agentDid,
      sealKey: sealingKey({ ARP_CLOUD_KEY_ENCRYPTION_KEY: env().ARP_CLOUD_KEY_ENCRYPTION_KEY }),
    });
    await tenantDb.updateAgent(agentDid, { runtimeKind: 'bridge' });
    track({
      distinctId: session.principalDid,
      event: 'agentid_key_exported',
      properties: { tenant_id: tenantDb.tenantId, agent_did: agentDid },
    });
    return NextResponse.json({
      ok: true,
      agent_did: agentDid,
      principal_did: agent.principalDid,
      public_key_multibase: agent.publicKeyMultibase,
      agent_private_key_multibase: ed25519RawToMultibase(raw),
      gateway_ws_url: process.env['ARP_CLOUD_GATEWAY_WS_URL'] ?? 'wss://gateway.arp.run/ws',
      handoff: agent.handoffJson,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    console.error('[agents/export-key]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
