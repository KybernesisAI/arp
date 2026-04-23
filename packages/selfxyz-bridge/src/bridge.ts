import {
  VcPresentationSchema,
  type PresentationRequest,
  type RequestPresentationInput,
  type VcPresentation,
  type VerifyResult,
} from './types.js';

/**
 * Configuration for the bridge. `baseUrl` defaults to the Self.xyz staging
 * origin; tests and cloud deployments may inject their own base URL.
 */
export interface BridgeOptions {
  baseUrl?: string;
  /** fetch override — the test suite swaps this for a mock server. */
  fetchImpl?: typeof fetch;
  /** Application ID assigned by Self.xyz. Required in prod, optional in tests. */
  appId?: string;
}

export const SELFXYZ_STAGING_BASE = 'https://staging.self.xyz';

/**
 * The bridge interface consumed by the owner app's pairing flows. Keep it
 * narrow — the prod Self.xyz client can evolve freely as long as this
 * surface is honoured.
 */
export interface SelfxyzBridge {
  /**
   * Ask Self.xyz for a VC presentation request scoped to `requiredVcs` +
   * `nonce`. Returns a QR payload (for the web UI) and a deep link (for the
   * Self.xyz mobile app).
   */
  requestVcPresentation(input: RequestPresentationInput): Promise<PresentationRequest>;
  /**
   * Verify a VC presentation the app received at its callback URL. Checks
   * structural shape, nonce, and that every `requiredVc` is present.
   */
  verifyPresentation(
    presentation: unknown,
    expectedVcs: string[],
    opts?: { expectedNonce?: string },
  ): Promise<VerifyResult>;
}

/**
 * HTTP-backed bridge. Calls Self.xyz staging (or whatever `baseUrl` resolves
 * to) for presentation-request minting; verification is done locally against
 * the shape the staging server documents.
 */
export function createSelfxyzBridge(opts: BridgeOptions = {}): SelfxyzBridge {
  const baseUrl = opts.baseUrl ?? SELFXYZ_STAGING_BASE;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  return {
    async requestVcPresentation(input) {
      const body = {
        nonce: input.nonce,
        peerDid: input.peerDid,
        requiredVcs: input.requiredVcs,
        callbackUrl: input.callbackUrl,
        appId: opts.appId,
      };
      const res = await fetchImpl(`${baseUrl}/v1/presentations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(
          `selfxyz presentation request failed: ${res.status} ${await res.text().catch(() => '')}`,
        );
      }
      const json = (await res.json()) as PresentationRequest;
      return {
        qrPayload: json.qrPayload,
        deepLinkUrl: json.deepLinkUrl,
        callbackUrl: json.callbackUrl ?? input.callbackUrl,
      };
    },

    async verifyPresentation(presentation, expectedVcs, opts2 = {}) {
      return verifyPresentation(presentation, expectedVcs, opts2);
    },
  };
}

/**
 * Side-effect-free verifier. Exposed for the in-memory bridge and direct
 * use in tests. Checks:
 *   - structural shape via zod,
 *   - every `expectedVc` is present,
 *   - nonce matches (when provided),
 *   - `attributes.verified === true` for non-country claims (heuristic),
 *   - `attributes.country` is a 2-letter ISO code when the country VC is
 *     requested.
 */
export function verifyPresentation(
  presentation: unknown,
  expectedVcs: string[],
  opts: { expectedNonce?: string } = {},
): VerifyResult {
  const parsed = VcPresentationSchema.safeParse(presentation);
  if (!parsed.success) {
    return {
      ok: false,
      attributes: {},
      reason: `presentation failed schema: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    };
  }
  const p = parsed.data;
  if (opts.expectedNonce !== undefined && p.nonce !== opts.expectedNonce) {
    return { ok: false, attributes: {}, reason: 'nonce mismatch' };
  }

  const byType = new Map(p.vcs.map((v) => [v.type, v]));
  const attributes: Record<string, unknown> = {};
  for (const vc of expectedVcs) {
    const entry = byType.get(vc);
    if (!entry) {
      return { ok: false, attributes, reason: `missing VC ${vc}` };
    }
    const attrVerdict = validateAttributes(vc, entry);
    if (!attrVerdict.ok) return attrVerdict;
    Object.assign(attributes, { [vc]: entry.attributes });
  }
  return { ok: true, attributes };
}

function validateAttributes(vc: string, entry: VcPresentation['vcs'][number]): VerifyResult {
  const a = entry.attributes ?? {};
  switch (vc) {
    case 'self_xyz.verified_human':
    case 'self_xyz.over_18':
    case 'self_xyz.over_21':
    case 'self_xyz.us_resident': {
      const v = a.verified;
      if (v !== true) {
        return {
          ok: false,
          attributes: {},
          reason: `${vc}: attribute.verified must be true`,
        };
      }
      return { ok: true, attributes: a };
    }
    case 'self_xyz.country': {
      const c = a.country;
      if (typeof c !== 'string' || !/^[A-Z]{2}$/.test(c)) {
        return {
          ok: false,
          attributes: {},
          reason: 'self_xyz.country: attribute.country must be a 2-letter ISO code',
        };
      }
      return { ok: true, attributes: a };
    }
    default:
      // Unknown VC type — pass through. Runtime consumers are expected to
      // decide whether to accept unknown types.
      return { ok: true, attributes: a };
  }
}
