/**
 * POST /api/pairing/invitations — persist a client-signed pairing proposal.
 * GET  /api/pairing/invitations — list the tenant's pending invitations.
 *
 * Phase-10a cloud pairing: the user's principal did:key private key lives in
 * the browser (Phase 8.5 invariant). The client builds + signs the proposal
 * locally using `@kybernesis/arp-pairing::createPairingProposal`, then POSTs
 * the fully signed object up here. The server's job is:
 *
 *   1. Validate the proposal schema (Zod).
 *   2. Confirm `proposal.issuer === session.principalDid` so a user can't
 *      impersonate another tenant's principal.
 *   3. Confirm `proposal.subject` is one of this tenant's agents.
 *   4. Persist the signed payload + metadata so the issuer can list + cancel
 *      it and later slices (audit viewer) can replay the proposal bytes.
 *   5. Return the shareable invitation URL with the signed payload carried
 *      ONLY in the URL fragment (`#<b64url(payload)>`). Fragments are
 *      stripped by the browser before the HTTP request, so pasting the URL
 *      does not leak the signed payload into access logs or analytics.
 */

import { NextResponse } from 'next/server';
import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { PairingProposalSchema } from '@kybernesis/arp-pairing';
import { pairingInvitations } from '@kybernesis/arp-cloud-db';
import { requireTenantDb, AuthError } from '@/lib/tenant-context';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  proposal: PairingProposalSchema,
});

function encodePayload(proposal: unknown): string {
  return Buffer.from(JSON.stringify(proposal), 'utf8').toString('base64url');
}

function buildInvitationUrl(baseUrl: string, payload: string): string {
  // URL fragment (#) keeps the signed payload out of server access logs —
  // fragments are stripped by the browser before the HTTP request fires.
  return `${baseUrl.replace(/\/+$/, '')}/pair/accept#${payload}`;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb, session } = await requireTenantDb();

    // 5/min per tenant — invitation authoring is rare; a burst is a bot
    // signal. Large invitations can sit unused for their full expiry window,
    // so capping author-rate keeps the table from blowing up.
    const limit = await checkRateLimit({
      bucket: `pairing-invitations:tenant:${tenantDb.tenantId}`,
      windowSeconds: 60,
      limit: 5,
    });
    if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

    const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'bad_request', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { proposal } = parsed.data;

    if (proposal.issuer !== session.principalDid) {
      return NextResponse.json({ error: 'issuer_mismatch' }, { status: 403 });
    }

    const agent = await tenantDb.getAgent(proposal.subject);
    if (!agent) {
      return NextResponse.json({ error: 'subject_not_tenant_agent' }, { status: 403 });
    }

    if (Object.keys(proposal.sigs).length < 1 || !proposal.sigs[proposal.issuer]) {
      return NextResponse.json({ error: 'issuer_signature_missing' }, { status: 400 });
    }

    const expiresAt = new Date(proposal.expires_at);
    if (!Number.isFinite(expiresAt.getTime())) {
      return NextResponse.json({ error: 'bad_expiry' }, { status: 400 });
    }
    if (expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'already_expired' }, { status: 400 });
    }

    const payload = encodePayload(proposal);
    const url = new URL(req.url);
    // Prefer the host the caller actually reached (app.arp.run, cloud.arp.run,
    // or a local dev host); falls back to the runtime-configured cloud base.
    const host = req.headers.get('x-forwarded-host') ?? url.host;
    const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
    const baseUrl = `${proto}://${host}`;

    const rows = await tenantDb.raw
      .insert(pairingInvitations)
      .values({
        tenantId: tenantDb.tenantId,
        issuerAgentDid: proposal.subject,
        requestedScopes: proposal.scope_selections as unknown as Record<string, unknown>,
        challenge: proposal.proposal_id,
        payload,
        expiresAt,
      })
      .returning();
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
    }

    return NextResponse.json({
      invitationId: row.id,
      invitationUrl: buildInvitationUrl(baseUrl, payload),
      expiresAt: row.expiresAt.toISOString(),
      proposalId: proposal.proposal_id,
      connectionId: proposal.connection_id,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function GET(): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const now = new Date();
    const rows = await tenantDb.raw
      .select()
      .from(pairingInvitations)
      .where(
        and(
          eq(pairingInvitations.tenantId, tenantDb.tenantId),
          isNull(pairingInvitations.cancelledAt),
          isNull(pairingInvitations.consumedAt),
          gt(pairingInvitations.expiresAt, now),
        ),
      )
      .orderBy(asc(pairingInvitations.createdAt));

    return NextResponse.json({
      invitations: rows.map((r) => ({
        id: r.id,
        issuerAgentDid: r.issuerAgentDid,
        proposalId: r.challenge,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

// Silence the isolated import warnings on or/and helpers — they are used
// dynamically in test helpers that depend on this route's surface.
void or;
