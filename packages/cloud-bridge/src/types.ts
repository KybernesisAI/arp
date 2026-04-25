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
