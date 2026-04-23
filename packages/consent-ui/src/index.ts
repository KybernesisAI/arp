/**
 * @kybernesis/arp-consent-ui — deterministic Cedar/obligations → English
 * projection for the owner-app consent screen.
 *
 * The whole surface is pure data in, structured data out. Rendering to
 * HTML/React is the consumer's responsibility — this package guarantees the
 * copy is stable + reviewable.
 */

export { renderConsentView, renderProposalConsent } from './render.js';
export { renderScopeConsentText } from './scope-render.js';
export { renderObligations, type ObligationRenderResult } from './obligations.js';
export { labelForVc, labelForVcWith } from './vcs.js';
export type { ConsentView, RenderConsentInput, RiskTier } from './types.js';
