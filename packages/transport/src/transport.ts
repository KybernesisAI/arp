import { signEnvelope, verifyEnvelope } from './envelope.js';
import { openMailbox, type Mailbox } from './mailbox.js';
import {
  transportError,
  type DidCommMessage,
  type MessageHandler,
  type MessageMeta,
  type TransportError,
  type TransportKeyStore,
  type TransportResolver,
} from './types.js';

export interface TransportOptions {
  did: string;
  keyStore: TransportKeyStore;
  resolver: TransportResolver;
  mailboxPath: string;
  /** Optional custom fetch (tests). Defaults to the global. */
  fetchImpl?: typeof fetch;
  /** Optional custom clock (epoch ms). Defaults to Date.now. */
  now?: () => number;
  /** POST timeout in ms. Default 5000. */
  sendTimeoutMs?: number;
  /** Poll cadence for the inbox → handler delivery loop. Default 50ms. */
  pollIntervalMs?: number;
}

export interface Transport {
  /** Send a signed message to a peer DID. */
  send(to: string, payload: DidCommMessage): Promise<void>;
  /** Register the handler invoked for every verified inbound envelope. */
  listen(handler: MessageHandler): void;
  /**
   * Ingest a raw envelope (as received by the HTTP `/didcomm` endpoint).
   * Verifies the signature against the purported sender's DID document,
   * persists to the mailbox, and triggers the handler loop.
   */
  receiveEnvelope(
    rawBody: string,
  ): Promise<{ ok: true; msgId: string } | { ok: false; error: TransportError }>;
  /** Flush any pending inbound messages to the registered handler. */
  drainInbox(): Promise<number>;
  /** Close the mailbox and stop the polling loop. */
  close(): Promise<void>;
}

export function createTransport(opts: TransportOptions): Transport {
  if (opts.did !== opts.keyStore.did) {
    throw new Error(`Transport did (${opts.did}) does not match keystore did (${opts.keyStore.did})`);
  }
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('fetch not available');
  const now = opts.now ?? (() => Date.now());
  const mailbox: Mailbox = openMailbox(opts.mailboxPath);

  let handler: MessageHandler | null = null;
  let closed = false;
  let pollTimer: NodeJS.Timeout | null = null;
  let inFlight: Promise<number> | null = null;

  async function doDeliver(): Promise<number> {
    if (!handler || closed) return 0;
    let delivered = 0;
    const pending = mailbox.dequeuePending(50);
    for (const entry of pending) {
      try {
        const result = await verifyEnvelope(
          entry.envelope_raw,
          await opts.resolver.resolveEd25519PublicKey(entry.peer_did),
        );
        if (!result.ok) continue;
        const meta: MessageMeta = {
          peerDid: entry.peer_did,
          verified: true,
          envelopeRaw: entry.envelope_raw,
          receivedAtMs: entry.received_at_ms,
        };
        await handler(result.message, meta);
        mailbox.markDelivered(entry.seq);
        delivered++;
      } catch {
        // Keep it in the inbox; next poll will retry.
      }
    }
    return delivered;
  }

  async function deliverPending(): Promise<number> {
    if (inFlight) return inFlight;
    inFlight = doDeliver();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  function scheduleNext() {
    if (closed) return;
    pollTimer = setTimeout(() => {
      deliverPending().finally(scheduleNext);
    }, opts.pollIntervalMs ?? 50);
    // Don't keep the event loop alive just for the timer.
    pollTimer.unref?.();
  }

  return {
    async send(to, payload) {
      const privateKey = await opts.keyStore.privateKeyRaw();
      const endpoint = await opts.resolver.resolveDidCommEndpoint(to);
      const envelope = await signEnvelope({
        message: { ...payload, from: opts.did, to: [to] },
        signerDid: opts.did,
        privateKey,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.sendTimeoutMs ?? 5000);
      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/didcomm-signed+json',
            'Content-Length': String(envelope.compact.length),
          },
          body: envelope.compact,
          signal: controller.signal,
        });
        if (!res.ok) {
          throw transportError('send_failed', `POST ${endpoint} → HTTP ${res.status}`);
        }
      } catch (err) {
        if ((err as TransportError).code) throw err;
        throw transportError('send_failed', `POST ${endpoint} failed`, err);
      } finally {
        clearTimeout(timer);
      }
    },

    listen(h) {
      handler = h;
      scheduleNext();
    },

    async receiveEnvelope(rawBody) {
      const trimmed = rawBody.trim();
      if (!trimmed) {
        return {
          ok: false,
          error: transportError('invalid_envelope', 'empty body'),
        };
      }
      let preview: {
        header: { kid?: string; alg?: string };
        payload: DidCommMessage;
      };
      try {
        preview = peekEnvelope(trimmed);
      } catch (err) {
        return {
          ok: false,
          error: transportError(
            'invalid_envelope',
            `failed to decode JWS: ${(err as Error).message}`,
          ),
        };
      }
      const peerDid = extractSignerDid(preview.header.kid, preview.payload.from);
      if (!peerDid) {
        return {
          ok: false,
          error: transportError('invalid_envelope', 'missing kid / from'),
        };
      }
      let publicKey: Uint8Array;
      try {
        publicKey = await opts.resolver.resolveEd25519PublicKey(peerDid);
      } catch (err) {
        return {
          ok: false,
          error: transportError('unknown_peer', `resolving ${peerDid} failed`, err),
        };
      }
      const verified = await verifyEnvelope(trimmed, publicKey);
      if (!verified.ok) {
        return {
          ok: false,
          error: transportError('invalid_signature', verified.error),
        };
      }
      mailbox.enqueue({
        msg_id: verified.message.id,
        peer_did: peerDid,
        envelope_raw: trimmed,
        received_at_ms: now(),
      });
      if (handler) {
        // Opportunistic immediate drain so tests don't need to wait for the
        // poll cadence. Failures fall back to the next poll tick.
        void deliverPending();
      }
      return { ok: true, msgId: verified.message.id };
    },

    async drainInbox() {
      return deliverPending();
    },

    async close() {
      closed = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      mailbox.close();
    },
  };
}

function peekEnvelope(compact: string): {
  header: { kid?: string; alg?: string };
  payload: DidCommMessage;
} {
  const parts = compact.split('.');
  if (parts.length !== 3) throw new Error('expected 3 JWS segments');
  const [h, p] = parts as [string, string, string];
  const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  return { header, payload };
}

function extractSignerDid(
  kid: string | undefined,
  from: string | undefined,
): string | null {
  if (kid) {
    const idx = kid.indexOf('#');
    return idx > 0 ? kid.slice(0, idx) : kid;
  }
  return from ?? null;
}
