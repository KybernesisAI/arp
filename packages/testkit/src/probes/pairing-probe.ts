import { readFileSync } from 'node:fs';
import * as ed25519 from '@noble/ed25519';
import {
  buildInvitationUrl,
  countersignProposal,
  createPairingProposal,
  parseInvitationUrl,
  verifyConnectionToken,
  type DidResolver,
} from '@kybernesis/arp-pairing';
import { loadScopesFromDirectory } from '@kybernesis/arp-scope-catalog';
import type { DidDocument, ScopeTemplate } from '@kybernesis/arp-spec';
import type { Probe, ProbeContext, ProbeResult } from '../types.js';
import { elapsed, now } from '../timing.js';
import { postJson } from '../http.js';

/**
 * Pairing probe — drives a full pairing flow end to end against a target
 * that exposes the `/admin/connections` surface (i.e. the Phase 4 admin API).
 *
 * Flow:
 *   1. Build a pairing proposal as the ISSUER side (test principal key).
 *   2. Serialise the invitation URL, parse back, countersign as AUDIENCE.
 *   3. Verify the dual-signed ConnectionToken against the injected resolver.
 *   4. POST the token into the target's `/admin/connections` to provision.
 *   5. (Optional) POST `/admin/connections/:id/revoke` to prove revoke works.
 *   6. Assert the revocation shows up on `/.well-known/revocations.json`.
 *
 * Requires an `adminToken` to authenticate admin requests. Skips with a
 * clear reason if one isn't provided.
 */
export interface PairingProbeOptions {
  adminToken: string | null | undefined;
  /** Issuer agent DID (the target's agent DID, e.g. `did:web:samantha.agent`). */
  issuerAgentDid: string;
  /** Issuer principal DID. */
  issuerPrincipalDid: string;
  /** Issuer principal private key (32-byte Ed25519). */
  issuerPrincipalPrivateKey: Uint8Array;
  /** Counterparty agent DID. */
  counterpartyAgentDid: string;
  /** Counterparty principal DID. */
  counterpartyPrincipalDid: string;
  /** Counterparty principal private key. */
  counterpartyPrincipalPrivateKey: Uint8Array;
  /** Absolute path or in-memory array of scope templates. */
  catalog: readonly ScopeTemplate[] | string;
  /** Resolver used to verify the ConnectionToken's sigs. */
  resolver: DidResolver;
  /** Scope selections to pair under. Defaults to a tiny read-only set. */
  scopeSelections?: Array<{ id: string; params?: Record<string, unknown> }>;
  /** Human-readable purpose. */
  purpose?: string;
  /** Whether to revoke after creation. Default true. */
  revoke?: boolean;
}

export function createPairingProbe(opts: PairingProbeOptions): Probe {
  return async (ctx: ProbeContext): Promise<ProbeResult> => {
    const startedAt = now();
    if (!opts.adminToken) {
      return {
        name: 'pairing-probe',
        pass: true,
        durationMs: elapsed(startedAt),
        skipped: true,
        skipReason: 'adminToken not provided; pairing probe requires admin access',
        details: {},
      };
    }

    const catalog =
      typeof opts.catalog === 'string' ? loadScopesFromDirectory(opts.catalog) : opts.catalog;

    try {
      const scopeSelections = opts.scopeSelections ?? [
        { id: 'files.projects.list' },
      ];

      const proposal = await createPairingProposal({
        issuer: opts.issuerPrincipalDid,
        subject: opts.issuerAgentDid,
        audience: opts.counterpartyAgentDid,
        purpose: opts.purpose ?? 'arp-testkit pairing-probe',
        scopeSelections,
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        scopeCatalogVersion: 'v1',
        catalog,
        issuerKey: {
          privateKey: opts.issuerPrincipalPrivateKey,
          kid: `${opts.issuerPrincipalDid}#key-1`,
        },
      });

      const invitationUrl = buildInvitationUrl(
        proposal,
        `${ctx.baseUrl.replace(/\/$/, '')}/pair/accept`,
      );
      const parsed = parseInvitationUrl(invitationUrl);

      const { token } = await countersignProposal({
        proposal: parsed,
        counterpartyKey: {
          privateKey: opts.counterpartyPrincipalPrivateKey,
          kid: `${opts.counterpartyPrincipalDid}#key-1`,
        },
        counterpartyDid: opts.counterpartyPrincipalDid,
        catalog,
      });

      const verdict = await verifyConnectionToken(token, { resolver: opts.resolver });
      if (!verdict.ok) {
        return fail(startedAt, `ConnectionToken did not verify: ${verdict.reason}`, {
          connection_id: token.connection_id,
        });
      }

      const adminBase = `${ctx.baseUrl.replace(/\/$/, '')}/admin`;
      const postRes = await postJson(
        `${adminBase}/connections`,
        { token },
        ctx,
        { authorization: `Bearer ${opts.adminToken}` },
      );
      if (!postRes.ok) {
        return fail(
          startedAt,
          `POST /admin/connections failed: HTTP ${postRes.status} ${postRes.rawText.slice(0, 200)}`,
          { status: postRes.status, connection_id: token.connection_id },
        );
      }

      if (opts.revoke !== false) {
        const revokeRes = await postJson(
          `${adminBase}/connections/${token.connection_id}/revoke`,
          { reason: 'testkit_probe' },
          ctx,
          { authorization: `Bearer ${opts.adminToken}` },
        );
        if (!revokeRes.ok) {
          return fail(
            startedAt,
            `revoke failed: HTTP ${revokeRes.status} ${revokeRes.rawText.slice(0, 200)}`,
            { status: revokeRes.status, connection_id: token.connection_id },
          );
        }

        const revListUrl = `${ctx.baseUrl.replace(/\/$/, '')}/.well-known/revocations.json`;
        const fetchImpl = ctx.fetchImpl ?? globalThis.fetch;
        if (!fetchImpl) throw new Error('no fetch available');
        const revRes = await fetchImpl(revListUrl);
        const revBody = (await revRes.json()) as {
          revocations?: Array<{ type: string; id: string }>;
        };
        const present = (revBody.revocations ?? []).some(
          (r) => r.type === 'connection' && r.id === token.connection_id,
        );
        if (!present) {
          return fail(
            startedAt,
            `revocation not published at /.well-known/revocations.json for ${token.connection_id}`,
            { connection_id: token.connection_id, revocations_listed: revBody.revocations ?? [] },
          );
        }
      }

      return {
        name: 'pairing-probe',
        pass: true,
        durationMs: elapsed(startedAt),
        details: {
          connection_id: token.connection_id,
          scope_count: scopeSelections.length,
          cedar_policy_count: token.cedar_policies.length,
          revoked: opts.revoke !== false,
        },
      };
    } catch (err) {
      return fail(startedAt, (err as Error).message, {});
    }
  };
}

export const pairingProbe: Probe = async (ctx: ProbeContext): Promise<ProbeResult> => {
  // Default form (audit without config) always skips; the pairing probe needs
  // principal keys + catalog to be meaningful.
  return {
    name: 'pairing-probe',
    pass: true,
    durationMs: 0,
    skipped: true,
    skipReason:
      'pairing probe needs issuer/counterparty keys + catalog; use createPairingProbe() programmatically',
    details: { target: ctx.target },
  };
};

function fail(
  startedAt: number,
  message: string,
  details: Record<string, unknown>,
): ProbeResult {
  return {
    name: 'pairing-probe',
    pass: false,
    durationMs: elapsed(startedAt),
    details,
    error: { code: 'pairing_probe_failed', message },
  };
}

/**
 * Helper for programmatic callers: mint a fresh Ed25519 principal key and
 * return the private key + DID doc stub suitable for the injected resolver.
 */
export async function mintTestPrincipal(
  did: string,
  multibaseEncoder: (raw: Uint8Array) => string,
): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  didDocument: DidDocument;
}> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  const keyId = `${did}#key-1`;
  const host = did.replace('did:web:', '');
  return {
    privateKey,
    publicKey,
    didDocument: {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: did,
      controller: did,
      verificationMethod: [
        {
          id: keyId,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: multibaseEncoder(publicKey),
        },
      ],
      authentication: [keyId],
      assertionMethod: [keyId],
      keyAgreement: [keyId],
      service: [
        {
          id: `${did}#didcomm`,
          type: 'DIDCommMessaging',
          serviceEndpoint: `https://${host}/didcomm`,
          accept: ['didcomm/v2'],
        },
      ],
      principal: {
        did,
        representationVC: `https://${host}/.well-known/representation.jwt`,
      },
    },
  };
}

/** Helper: readFileSync but swallow ENOENT to null (scope catalog path optional). */
export function maybeReadFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

