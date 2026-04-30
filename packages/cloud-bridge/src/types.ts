/**
 * Core types for the cloud-bridge.
 *
 * The bridge process owns the cloud-gateway WS on one side. On the other
 * side, an `Adapter` knows how to take a plaintext message and get a
 * plaintext reply back from a locally-running agent — using *only* that
 * agent framework's existing native API. No agent code changes ever.
 *
 * Each agent framework gets its own adapter (kyberbot, openclaw, hermes,
 * generic-http). New frameworks plug in by implementing this interface.
 */

export interface InboundContext {
  /** Sender DID from the verified envelope (e.g. did:web:samantha.agent). */
  peerDid: string;
  /** Optional thread id; the same peer talking again uses the same thid. */
  thid: string | null;
  /** Connection id when the cloud has one tracked. */
  connectionId: string | null;
  /** Plaintext extracted from the inbound DIDComm body. */
  text: string;
  /**
   * Full DIDComm body (action, resource, obligations, custom fields).
   * Plain-text messages have just `{ text }` here; structured ARP
   * action requests (Phase B) populate `action`, `resource`,
   * `obligations`, and any action-specific params. Adapters that
   * implement typed dispatch (kyberbot in PR-AC-5) inspect this to
   * route to typed endpoints; legacy adapters that only know how to
   * chat can ignore everything except `text`.
   */
  body?: Record<string, unknown>;
  /**
   * Obligations attached to the cloud-side decision. Honoring them
   * is the ADAPTER's responsibility — that's the difference between
   * policy-at-the-wire (LLM hopes to comply) and policy-at-the-data-
   * layer (code guarantees compliance).
   */
  obligations?: Array<{ type: string; params: Record<string, unknown> }>;
}

export interface Adapter {
  /** Adapter id used in CLI flags + logs. */
  readonly name: string;
  /**
   * Hand a message to the local agent and return its plaintext reply.
   * The bridge wraps this reply in a signed DIDComm envelope and ships
   * it back through the cloud-gateway WS.
   */
  ask(ctx: InboundContext): Promise<string>;
  /** Optional: called once on bridge startup. Use to validate config. */
  init?(): Promise<void>;
}

export interface BridgeOptions {
  /** Path to the handoff JSON downloaded from the cloud dashboard. */
  handoffPath: string;
  /** The chosen adapter (one per process). */
  adapter: Adapter;
  /** Override the WS URL embedded in the handoff (debugging only). */
  cloudWsUrl?: string;
}
