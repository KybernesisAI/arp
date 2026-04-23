/**
 * @kybernesis/arp-selfxyz-bridge — minimal adapter over Self.xyz's VC
 * presentation flow. The owner app calls `requestVcPresentation` to mint a
 * QR / deep link; the Self.xyz mobile app POSTs the presentation back to our
 * callback; we call `verifyPresentation` before accepting a pairing.
 *
 * v0 supports 5 VC attributes natively (see `SUPPORTED_SELFXYZ_VCS`); any
 * other type passes through the verifier without attribute-specific checks.
 */

export {
  createSelfxyzBridge,
  verifyPresentation,
  SELFXYZ_STAGING_BASE,
  type BridgeOptions,
  type SelfxyzBridge,
} from './bridge.js';
export {
  createMockSelfxyzBridge,
  buildMockPresentation,
  type MockBridgeOptions,
} from './mock.js';
export {
  SUPPORTED_SELFXYZ_VCS,
  PresentedVcSchema,
  VcPresentationSchema,
  type PresentationRequest,
  type PresentedVc,
  type RequestPresentationInput,
  type SupportedSelfxyzVc,
  type VcPresentation,
  type VerifyResult,
} from './types.js';
