export interface CloudClientConfig {
  /** WebSocket URL, e.g. wss://arp.cloud/ws or ws://localhost:3001/ws. */
  cloudWsUrl: string;
  /** Agent DID, e.g. did:web:samantha.agent. */
  agentDid: string;
  /**
   * Agent's private key (raw 32-byte ed25519). The client signs a
   * challenge of `sha256("arp-cloud-ws:" + did + ":" + ts)` to
   * authenticate.
   */
  agentPrivateKey: Uint8Array;
  /** Local agent HTTP URL that accepts inbound tasks (e.g. http://127.0.0.1:4500). */
  agentApiUrl: string;
  /** Client version tag sent on hello. Defaults to package.json version. */
  clientVersion?: string;
  /** Max backoff between reconnect attempts in ms. Default 60_000. */
  maxBackoffMs?: number;
  /** Initial backoff in ms. Default 1000. */
  initialBackoffMs?: number;
  /** Override fetch used to deliver to local agent. */
  fetchImpl?: typeof fetch;
  /** Clock override for tests. */
  now?: () => number;
  /**
   * WebSocket constructor override. Defaults to `ws.WebSocket`. Tests pass
   * the browser-compat `WebSocket` exported by the node `ws` library.
   */
  webSocketCtor?: WebSocketLike;
  /** Called on state transitions. */
  onStateChange?: (state: CloudClientState) => void;
  /** Called when an envelope is successfully delivered. */
  onInboundDelivered?: (messageId: string, msgId: string) => void;
  /** Called on errors that don't kill the loop. */
  onError?: (err: Error) => void;
}

export type CloudClientState =
  | 'initial'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'stopped';

export interface CloudClientHandle {
  readonly state: () => CloudClientState;
  /** Stop the client and close the WS. No auto-reconnect after this. */
  stop(): Promise<void>;
  /** Send an outbound-envelope event (used by tests; normally the client delivers these automatically from local agent responses). */
  sendOutboundEnvelope(params: {
    msgId: string;
    msgType: string;
    peerDid: string;
    envelope: string;
    connectionId?: string | null;
  }): Promise<void>;
  /** Internal: attempts until next reconnect time (tests). */
  readonly reconnectAttempts: () => number;
}

export interface WebSocketLike {
  new (url: string, protocols?: string | string[]): WebSocketInstance;
}

export interface WebSocketInstance {
  readonly readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}
