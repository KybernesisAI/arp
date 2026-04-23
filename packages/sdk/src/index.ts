/**
 * @kybernesis/arp-sdk — the developer-facing entry point for ARP agents.
 *
 * Re-exports the public `ArpAgent` class plus all the types an adapter or
 * application author needs. Does NOT re-export runtime internals, DIDComm
 * wire types, Cedar-WASM primitives, or SQLite schemas — those stay behind
 * the SDK boundary.
 *
 * Usage:
 *
 *     import { ArpAgent } from '@kybernesis/arp-sdk';
 *
 *     const agent = await ArpAgent.fromHandoff('./handoff.json', {
 *       onIncoming: async (task, ctx) => ({ body: { ok: true } }),
 *     });
 *     await agent.start({ port: 4500 });
 */

export { ArpAgent } from './agent.js';
export type {
  ArpAgentEvent,
  ArpAgentEventPayload,
  ArpAgentOptions,
  AuditEventInput,
  CheckInput,
  ConnectionAPI,
  EgressInput,
  InboundContext,
  InboundHandler,
  InboundReply,
  InboundTask,
  PairingEvent,
  PdpAPI,
  PdpDecision,
  RegistryReadAPI,
  Resource,
  RevocationEvent,
  RotationEvent,
  ConnectionToken,
  HandoffBundle,
  Obligation,
} from './types.js';
export { applyObligations } from './obligations.js';
export { bootstrapSdk, type BootstrapResult, type BootstrapInput } from './bootstrap.js';
export {
  guardAction,
  type GuardActionInput,
  type GuardActionResult,
} from './guard.js';
