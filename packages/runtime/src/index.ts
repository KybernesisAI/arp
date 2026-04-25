/**
 * @kybernesis/arp-runtime — Hono HTTP server + PDP dispatch + registry/audit
 * orchestration. Depends on all other Phase 2 runtime packages and wires them
 * together behind a single `Runtime` interface.
 *
 * See `docs/ARP-phase-2-runtime-core.md §4 Task 7` for the request pipeline.
 */

export { createRuntime, type Runtime, type RuntimeOptions } from './runtime.js';
export { buildWellKnownDocs, type WellKnownDocs } from './well-known.js';
export { createConnectionMemory, type ConnectionMemory } from './memory.js';
export {
  openAuthStore,
  type AuthStore,
  type IdentityRotationState,
  type UserCredentialRow,
  type WebauthnPurpose,
} from './auth-store.js';
export type {
  DispatchHandler,
  DispatchInput,
  DispatchResult,
  MappedRequest,
  RequestMapper,
  RuntimeConfig,
} from './types.js';
