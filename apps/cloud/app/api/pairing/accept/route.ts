/**
 * POST /api/pairing/accept — consume a pairing invitation.
 *
 * The accepting browser has already countersigned the proposal with its
 * principal did:key (Phase 8.5 invariant — we never see private keys). We
 * receive `{ proposal, acceptingAgentDid }` in the body where `proposal` is
 * dual-signed (issuer + counterparty principal sigs). This route:
 *
 *   1. Validates the accepting agent belongs to the caller's tenant.
 *   2. Verifies BOTH signatures via `verifyPairingProposal` with a resolver
 *      that consults the cross-tenant `agents` table (for cloud-hosted
 *      audience DID docs) and synthesises did:key docs for the two
 *      principals.
 *   3. Re-compiles `scope_selections` against the local scope catalog via
 *      `countersignProposal(catalog=…)`. That re-compilation step is the
 *      audience-side defence against a forged `cedar_policies` blob in the
 *      wire payload.
 *   4. Creates a row in `connections` for this tenant AND, when the issuer
 *      is also a cloud tenant, for the issuer side. Sovereign-sidecar
 *      issuers don't get an insert here — their side reconciles locally.
 *   5. Stamps `consumed_at` on the matching `pairing_invitations` row so
 *      subsequent accepts return `already_consumed`.
 *
 * Errors are explicit + machine-readable so the client can surface actionable
 * messages ("already accepted", "signature failed", "accepting agent is not
 * yours").
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  PairingProposalSchema,
  verifyPairingProposal,
  verifyAmendment,
} from '@kybernesis/arp-pairing';
import { compileBundle } from '@kybernesis/arp-scope-catalog';
import {
  connections,
  pairingInvitations,
  tenants,
  toTenantId,
  withTenant,
  type ConnectionRow,
  type TenantDb,
} from '@kybernesis/arp-cloud-db';
import { requireTenantDb, AuthError } from '@/lib/tenant-context';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { createPairingResolver } from '@/lib/pairing-resolver';
import { getScopeCatalog } from '@/lib/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  proposal: PairingProposalSchema,
  acceptingAgentDid: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb, session } = await requireTenantDb();
    void session;

    const limit = await checkRateLimit({
      bucket: `pairing-accept:tenant:${tenantDb.tenantId}`,
      windowSeconds: 60,
      limit: 10,
    });
    if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'bad_request', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { proposal, acceptingAgentDid } = parsed.data;

    // 1. Accepting agent must belong to caller.
    if (proposal.audience !== acceptingAgentDid) {
      return NextResponse.json(
        { error: 'accepting_agent_not_audience' },
        { status: 400 },
      );
    }
    const agent = await tenantDb.getAgent(acceptingAgentDid);
    if (!agent) {
      return NextResponse.json(
        { error: 'accepting_agent_not_tenant' },
        { status: 403 },
      );
    }

    // 2. Verify both signatures. The cross-tenant resolver handles:
    //    - did:key principals (both issuer + audience) via terminal decode
    //    - did:web audience agent via local `agents` table lookup
    const resolver = createPairingResolver(tenantDb.raw);
    const verdict = await verifyPairingProposal(proposal, { resolver });
    if (!verdict.ok) {
      return NextResponse.json(
        { error: 'signature_invalid', reason: verdict.reason },
        { status: 400 },
      );
    }

    // 3. Re-compile scope selections against local catalog. Guards against a
    //    forged `cedar_policies` blob embedded in the invitation. Mirrors the
    //    `assertCompilationMatches` guard inside
    //    `@kybernesis/arp-pairing::countersignProposal`, inlined so we don't
    //    have to synthesise a dummy counterparty signing key just to reach
    //    the guard.
    const compiled = compileBundle({
      scopeIds: proposal.scope_selections.map((s) => s.id),
      paramsMap: Object.fromEntries(
        proposal.scope_selections.map((s) => [s.id, s.params ?? {}]),
      ),
      audienceDid: proposal.audience,
      catalog: getScopeCatalog(),
    });
    if (compiled.policies.length !== proposal.cedar_policies.length) {
      return NextResponse.json(
        {
          error: 'cedar_policy_mismatch',
          reason: `policy count mismatch (proposal=${proposal.cedar_policies.length}, recompiled=${compiled.policies.length})`,
        },
        { status: 400 },
      );
    }
    for (let i = 0; i < compiled.policies.length; i++) {
      if (compiled.policies[i] !== proposal.cedar_policies[i]) {
        return NextResponse.json(
          {
            error: 'cedar_policy_mismatch',
            reason: `cedar policy #${i} does not match local recompilation`,
          },
          { status: 400 },
        );
      }
    }

    // 3b. Bidirectional consent — verify + re-compile the audience's
    //     amendment if present. The amendment carries the audience's
    //     own grants (what THEY allow the issuer's agent to do TO them),
    //     signed independently by the audience's principal. Without
    //     bidirectional grants the connection is one-way; with them
    //     paired agents can converse as equals — the primary use case.
    let amendmentEffectivePolicies: string[] = [];
    let amendmentEffectiveObligations: typeof proposal.obligations = [];
    if (proposal.audience_amendment) {
      const amendment = proposal.audience_amendment;
      if (amendment.connection_id !== proposal.connection_id) {
        return NextResponse.json(
          {
            error: 'amendment_mismatch',
            reason: 'audience_amendment.connection_id does not match proposal.connection_id',
          },
          { status: 400 },
        );
      }
      // The amendment is signed by the audience's PRINCIPAL. Match by
      // looking at the proposal's `sigs` map — the non-issuer entry is
      // the audience principal that countersigned. We use the same
      // resolver that just verified the proposal, so this principal is
      // already known to be valid + key-extractable.
      const audienceSigEntry = Object.entries(proposal.sigs).find(
        ([k]) => k !== proposal.issuer,
      );
      if (!audienceSigEntry) {
        return NextResponse.json(
          { error: 'amendment_audience_unknown', reason: 'no audience signer on proposal' },
          { status: 400 },
        );
      }
      const audiencePrincipalDid = audienceSigEntry[0];
      const amendmentSignerResult = await resolver.resolve(audiencePrincipalDid);
      if (!amendmentSignerResult.ok) {
        return NextResponse.json(
          {
            error: 'amendment_resolver_failed',
            reason: `cannot resolve amendment signer: ${amendmentSignerResult.reason}`,
          },
          { status: 400 },
        );
      }
      const verifyAmend = await verifyAmendment(amendment, amendmentSignerResult.value);
      if (!verifyAmend.ok) {
        return NextResponse.json(
          { error: 'amendment_signature_invalid', reason: verifyAmend.reason },
          { status: 400 },
        );
      }
      // Re-compile audience's selections to guard against a forged
      // amendment.cedar_policies blob. The audience's policies grant
      // the ISSUER's agent — so audienceDid in the cedar template
      // becomes proposal.subject (issuer's agent).
      const recompiledAmendment = compileBundle({
        scopeIds: amendment.scope_selections.map((s) => s.id),
        paramsMap: Object.fromEntries(
          amendment.scope_selections.map((s) => [s.id, s.params ?? {}]),
        ),
        audienceDid: proposal.subject,
        catalog: getScopeCatalog(),
      });
      if (recompiledAmendment.policies.length !== amendment.cedar_policies.length) {
        return NextResponse.json(
          {
            error: 'amendment_cedar_mismatch',
            reason: `amendment policy count mismatch (claimed=${amendment.cedar_policies.length}, recompiled=${recompiledAmendment.policies.length})`,
          },
          { status: 400 },
        );
      }
      for (let i = 0; i < recompiledAmendment.policies.length; i++) {
        if (recompiledAmendment.policies[i] !== amendment.cedar_policies[i]) {
          return NextResponse.json(
            {
              error: 'amendment_cedar_mismatch',
              reason: `amendment cedar policy #${i} does not match local recompilation`,
            },
            { status: 400 },
          );
        }
      }
      amendmentEffectivePolicies = [...amendment.cedar_policies];
      amendmentEffectiveObligations = amendment.obligations.map((o) => ({
        type: o.type,
        params: { ...o.params },
      }));
    }

    // Project the ConnectionToken from the already-dual-signed proposal.
    // verifyPairingProposal already confirmed both principals signed the
    // same canonical bytes, so the sig map is safe to strip to values.
    // Effective cedar_policies merges proposal (issuer's grants) with
    // amendment (audience's grants) — PDP evaluates all of them and the
    // matching principal+action policy fires.
    const realToken = {
      connection_id: proposal.connection_id,
      issuer: proposal.issuer,
      subject: proposal.subject,
      audience: proposal.audience,
      purpose: proposal.purpose,
      cedar_policies: [...proposal.cedar_policies, ...amendmentEffectivePolicies],
      obligations: [
        ...proposal.obligations.map((o) => ({
          type: o.type,
          params: { ...o.params },
        })),
        ...amendmentEffectiveObligations,
      ],
      scope_catalog_version: proposal.scope_catalog_version,
      expires: proposal.expires_at,
      sigs: Object.fromEntries(
        Object.entries(proposal.sigs).map(([k, v]) => [k, v.value]),
      ),
    };

    // 4. Dedup against any prior consumption of this exact connection id on
    //    this tenant.
    const existing = await tenantDb.getConnection(proposal.connection_id);
    if (existing) {
      return NextResponse.json(
        { error: 'already_consumed', connectionId: proposal.connection_id },
        { status: 409 },
      );
    }

    // 4b. If this proposal replaces an existing connection (Phase 4 Task 7
    //     re-countersign flow), validate the replacement target lives on
    //     this tenant + still belongs to the same agent pair. Otherwise
    //     reject — a malicious issuer could otherwise try to "replace" a
    //     connection they don't own.
    if (proposal.replaces) {
      const oldConn = await tenantDb.getConnection(proposal.replaces);
      if (!oldConn) {
        return NextResponse.json(
          { error: 'replaces_not_found', replaces: proposal.replaces },
          { status: 404 },
        );
      }
      if (oldConn.agentDid !== acceptingAgentDid || oldConn.peerDid !== proposal.subject) {
        return NextResponse.json(
          {
            error: 'replaces_pair_mismatch',
            detail:
              'the replaced connection is not between the same two agents as the new proposal',
          },
          { status: 403 },
        );
      }
      if (oldConn.status === 'revoked') {
        return NextResponse.json(
          { error: 'replaces_revoked', detail: 'cannot replace a revoked connection' },
          { status: 409 },
        );
      }
    }

    // 5. Insert the connection on the caller's (acceptor) tenant.
    await insertConnection(tenantDb, {
      connectionId: proposal.connection_id,
      tenantId: tenantDb.tenantId,
      agentDid: acceptingAgentDid,
      peerDid: proposal.subject,
      token: realToken,
      proposal,
    });

    // 5b. Supersede the predecessor on this tenant if applicable.
    if (proposal.replaces) {
      await tenantDb.updateConnectionStatus(
        proposal.replaces,
        'revoked',
        `superseded_by:${proposal.connection_id}`,
      );
      // Stamp the metadata pointer so audit chains can trace the rescope
      // forward. We use the tenantDb.raw escape hatch since metadata is
      // not in updateConnectionStatus's signature.
      await tenantDb.raw
        .update(connections)
        .set({ metadata: { replacedBy: proposal.connection_id } as Record<string, unknown> })
        .where(
          and(
            eq(connections.tenantId, tenantDb.tenantId),
            eq(connections.connectionId, proposal.replaces),
          ),
        );
    }

    // 6. Best-effort insert on the issuer's cloud tenant (if they're also
    //    hosted here). Sovereign sidecar issuers reconcile locally.
    const issuerTenantRow = await tenantDb.raw
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.principalDid, proposal.issuer))
      .limit(1);
    const issuerTenantId = issuerTenantRow[0]?.id;
    if (issuerTenantId) {
      const issuerTenantDb = withTenant(tenantDb.raw, toTenantId(issuerTenantId));
      const already = await issuerTenantDb.getConnection(proposal.connection_id);
      if (!already) {
        // Confirm the issuer agent still belongs to the issuer tenant. Not a
        // hard requirement to insert the connection — but if it fails the
        // issuer side is probably no longer in sync anyway and we should
        // skip the cross-tenant write rather than write orphaned rows.
        const issuerAgent = await issuerTenantDb.getAgent(proposal.subject);
        if (issuerAgent) {
          await insertConnection(issuerTenantDb, {
            connectionId: proposal.connection_id,
            tenantId: issuerTenantId,
            agentDid: proposal.subject,
            peerDid: acceptingAgentDid,
            token: realToken,
            proposal,
          });
          // Mirror the supersede on the issuer's side when this is a
          // replacement. Both tenants' rows for the old connection_id
          // need to flip to 'revoked' or the issuer side keeps using the
          // stale policies.
          if (proposal.replaces) {
            const oldOnIssuer = await issuerTenantDb.getConnection(proposal.replaces);
            if (oldOnIssuer && oldOnIssuer.status !== 'revoked') {
              await issuerTenantDb.updateConnectionStatus(
                proposal.replaces,
                'revoked',
                `superseded_by:${proposal.connection_id}`,
              );
              await issuerTenantDb.raw
                .update(connections)
                .set({
                  metadata: { replacedBy: proposal.connection_id } as Record<string, unknown>,
                })
                .where(
                  and(
                    eq(connections.tenantId, issuerTenantId),
                    eq(connections.connectionId, proposal.replaces),
                  ),
                );
            }
          }
        }
      }
    }

    // 7. Flip the invitation row to consumed (best-effort, cross-tenant
    //    scoped to the issuer's row).
    if (issuerTenantId) {
      await tenantDb.raw
        .update(pairingInvitations)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(pairingInvitations.tenantId, issuerTenantId),
            eq(pairingInvitations.challenge, proposal.proposal_id),
          ),
        );
    }
    return NextResponse.json({
      ok: true,
      connectionId: proposal.connection_id,
      peerAgentDid: proposal.subject,
      scopes: proposal.scope_selections.map((s) => s.id),
      obligations: proposal.obligations,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

async function insertConnection(
  tenantDb: TenantDb,
  input: {
    connectionId: string;
    tenantId: string;
    agentDid: string;
    peerDid: string;
    token: {
      scope_catalog_version: string;
      cedar_policies: string[];
      obligations: unknown[];
      expires: string;
    };
    proposal: z.infer<typeof PairingProposalSchema>;
  },
): Promise<ConnectionRow> {
  return tenantDb.createConnection({
    connectionId: input.connectionId,
    agentDid: input.agentDid,
    peerDid: input.peerDid,
    label: input.proposal.purpose,
    purpose: input.proposal.purpose,
    tokenJws: '',
    tokenJson: input.token as unknown as Record<string, unknown>,
    cedarPolicies: input.token.cedar_policies as unknown as Record<string, unknown>,
    obligations: input.token.obligations as unknown as Record<string, unknown>,
    scopeCatalogVersion: input.token.scope_catalog_version,
    // Persist scope_selections in metadata so the connection-edit UI can
    // pre-fill the per-scope picker from what was previously approved.
    // (cedar_policies are the wire-level upper bound; the human-shaped
    // selections live only in the proposal and would otherwise be lost
    // after accept.)
    metadata: {
      scopeSelections: input.proposal.scope_selections as unknown,
      ...(input.proposal.replaces ? { replaces: input.proposal.replaces } : {}),
    } as Record<string, unknown>,
    expiresAt: new Date(input.token.expires),
  });
}

