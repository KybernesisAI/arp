/**
 * @kybernesis/arp-pdp — Policy Decision Point.
 *
 * Wraps @cedar-policy/cedar-wasm with ARP's @obligation annotation semantics.
 * Consumers pass Cedar policy strings (permit/forbid set) and optional
 * obligation policy strings; the PDP returns `{ decision, obligations,
 * policies_fired, reasons }`.
 *
 * See `docs/ARP-policy-examples.md` for the full Cedar profile, including
 * the `@obligation` / `@obligation_params` annotations that extend Cedar.
 */

export { createPdp } from './pdp.js';
export type { EvaluateInput, Entity, Pdp, PdpDecision } from './types.js';
export {
  parseObligationPolicy,
  obligationRecord,
  type ParsedObligationPolicy,
} from './obligations.js';
export { toCedarValue, entityToJson } from './cedar.js';
