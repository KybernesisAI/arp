export interface CloudClientConfig {
  /** WebSocket URL, e.g. wss://cloud.arp.run/ws or ws://localhost:3001/ws. */
  cloudWsUrl: string;
  /** Agent DID, e.g. did:web:samantha.agent. */
  agentDid: string;
  /**
   * Agent's private key (raw 32-byte ed25519). The client signs a
   * challenge of `sha256("arp-cloud-ws:" + did + ":" + ts)` to
   * authenticate.
   */
  agentPrivateKey: Uint8Array;
  /**
   * Local agent HTTP URL that accepts inbound tasks (e.g.
   * http://127.0.0.1:4500). Required when `onIncoming` is not set; the
   * client POSTs each inbound envelope to `${agentApiUrl}/didcomm`. When
   * `onIncoming` is provided, this field is ignored.
   */
  agentApiUrl?: string;
  /**
   * In-process delivery callback. When set, takes precedence over
   * `agentApiUrl` — every inbound message is handed to this callback
   * instead of being POSTed over HTTP. Returning resolves → cloud is
   * acked; throwing → no ack, cloud requeues after 30s. Use this when
   * the cloud-client lives in the same process as the agent (e.g. the
   * KyberBot ARP channel) to avoid an unnecessary localhost HTTP hop.
   */
  onIncoming?: (input: InboundMessage) => Promise<void>;
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

export interface InboundMessage {
  /** Raw signed-envelope wire bytes (compact JWS). The cloud has already verified the signature. */
  envelope: string;
  /** Original message id from the peer's envelope. */
  msgId: string;
  /** DIDComm protocol URI from the inbound envelope. */
  msgType: string;
  /** Sender DID, when the cloud could resolve it from the envelope kid. */
  peerDid: string | null;
  /** Active connection id, when this message belongs to a connection. */
  connectionId: string | null;
  /** PDP decision pre-computed by the cloud — agents should honour this. */
  decision: 'allow' | 'deny';
  /** Obligations the cloud merged from the connection token + dynamic policies. */
  obligations: Array<{ type: string; params: Record<string, unknown> }>;
  /** Names of policies that fired in the cloud PDP. Useful for audit. */
  policiesFired: string[];
}

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
