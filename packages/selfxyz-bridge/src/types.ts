import { z } from 'zod';

/**
 * The five Self.xyz VC attributes the v0 bridge supports directly. Every
 * other `self_xyz.*` type flows through the generic verifier with the `type`
 * string preserved so downstream code can recognise it, but without
 * attribute-specific shape checks.
 */
export const SUPPORTED_SELFXYZ_VCS = [
  'self_xyz.verified_human',
  'self_xyz.over_18',
  'self_xyz.over_21',
  'self_xyz.us_resident',
  'self_xyz.country',
] as const;

export type SupportedSelfxyzVc = (typeof SUPPORTED_SELFXYZ_VCS)[number];

/** Single VC entry in a presented response. */
export const PresentedVcSchema = z.object({
  type: z.string().min(1),
  /**
   * Arbitrary attributes the issuer disclosed. v0 allows unknown shapes and
   * leaves interpretation to the caller — the ARP runtime reads specific
   * fields (`verified`, `country`, …) per `type`.
   */
  attributes: z.record(z.string(), z.unknown()).default({}),
  /** Optional ZK proof bytes / wrapper. Opaque to this package. */
  proof: z.unknown().optional(),
  /** Optional issuer DID / URL. */
  issuer: z.string().optional(),
});
export type PresentedVc = z.infer<typeof PresentedVcSchema>;

/** Top-level structure Self.xyz sends to our callback. */
export const VcPresentationSchema = z.object({
  /** Echo of the nonce we issued with the request. */
  nonce: z.string().min(1),
  /** DID of the agent that initiated the request. */
  peerDid: z.string().min(1),
  /** Each requested VC, in the same order we asked for them. */
  vcs: z.array(PresentedVcSchema),
  /** Issued-at / expires-at timestamps (ISO 8601). Optional. */
  iat: z.string().optional(),
  exp: z.string().optional(),
});
export type VcPresentation = z.infer<typeof VcPresentationSchema>;

export interface RequestPresentationInput {
  requiredVcs: string[];
  peerDid: string;
  nonce: string;
  /** Callback URL Self.xyz will POST the presentation to. */
  callbackUrl: string;
}

export interface PresentationRequest {
  qrPayload: string;
  deepLinkUrl: string;
  callbackUrl: string;
}

export interface VerifyResult {
  ok: boolean;
  attributes: Record<string, unknown>;
  /** Detailed reason when `ok === false`. */
  reason?: string;
}
