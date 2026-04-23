import type {
  PresentationRequest,
  RequestPresentationInput,
  VcPresentation,
  VerifyResult,
} from './types.js';
import { verifyPresentation, type SelfxyzBridge } from './bridge.js';

export interface MockBridgeOptions {
  /** Nonces returned by the mock, in order. Falls back to a stable counter. */
  seedQrPayload?: string;
  /** Pre-canned presentations, keyed by nonce, the mock will hand back. */
  presentations?: Map<string, VcPresentation>;
}

/**
 * In-memory SelfxyzBridge for tests. Tracks the requests it has issued and
 * can be primed with pre-built presentations to verify against.
 */
export function createMockSelfxyzBridge(
  opts: MockBridgeOptions = {},
): SelfxyzBridge & {
  readonly requests: RequestPresentationInput[];
  primePresentation(nonce: string, p: VcPresentation): void;
  getPresentation(nonce: string): VcPresentation | undefined;
} {
  const requests: RequestPresentationInput[] = [];
  const presentations = new Map<string, VcPresentation>(opts.presentations ?? []);

  return {
    requests,
    primePresentation(nonce, p) {
      presentations.set(nonce, p);
    },
    getPresentation(nonce) {
      return presentations.get(nonce);
    },

    async requestVcPresentation(input): Promise<PresentationRequest> {
      requests.push(input);
      return {
        qrPayload:
          opts.seedQrPayload ?? `selfxyz://mock/${input.nonce}`,
        deepLinkUrl: `https://staging.self.xyz/app?nonce=${input.nonce}`,
        callbackUrl: input.callbackUrl,
      };
    },

    async verifyPresentation(
      presentation,
      expectedVcs,
      opts2,
    ): Promise<VerifyResult> {
      return verifyPresentation(presentation, expectedVcs, opts2);
    },
  };
}

/**
 * Build a synthetic valid presentation for a given set of VCs. Used by tests
 * that want to exercise the happy path without a real Self.xyz roundtrip.
 */
export function buildMockPresentation(args: {
  nonce: string;
  peerDid: string;
  vcs: string[];
  country?: string;
}): VcPresentation {
  return {
    nonce: args.nonce,
    peerDid: args.peerDid,
    vcs: args.vcs.map((type) => ({
      type,
      attributes: type === 'self_xyz.country'
        ? { country: args.country ?? 'US' }
        : { verified: true },
    })),
  };
}
