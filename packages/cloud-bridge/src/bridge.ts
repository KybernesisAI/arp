/**
 * Bridge core — wires `@kybernesis/arp-cloud-client` to an adapter.
 *
 * On inbound:
 *   1. cloud-client receives `inbound_message` from the cloud-gateway
 *   2. We decode the JWS payload to get the DIDComm body
 *   3. Hand `body.text` to the adapter; adapter returns a reply string
 *   4. We sign a response envelope and send it via outbound_envelope
 *
 * The bridge process is stateless. Conversation state, memory, skills —
 * all of that lives inside the agent framework. We're just transport.
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  createCloudClient,
  type CloudClientHandle,
  type InboundMessage,
} from '@kybernesis/arp-cloud-client';
import {
  signEnvelope,
  multibaseEd25519ToRaw,
  base64urlDecode,
} from '@kybernesis/arp-transport';
import type { Adapter, BridgeOptions } from './types.js';

interface HandoffBundle {
  agent_did: string;
  principal_did: string;
  public_key_multibase: string;
  agent_private_key_multibase: string;
  gateway_ws_url: string;
}

export interface BridgeHandle {
  readonly agentDid: string;
  readonly gatewayWsUrl: string;
  readonly adapterName: string;
  state(): string;
  stop(): Promise<void>;
}

export async function startBridge(opts: BridgeOptions): Promise<BridgeHandle> {
  let bundle: HandoffBundle;
  try {
    bundle = JSON.parse(readFileSync(opts.handoffPath, 'utf-8')) as HandoffBundle;
  } catch (err) {
    throw new Error(`cannot read handoff at ${opts.handoffPath}: ${(err as Error).message}`);
  }

  const agentDid = bundle.agent_did;
  const privateKey = multibaseEd25519ToRaw(bundle.agent_private_key_multibase);
  const cloudWsUrl = opts.cloudWsUrl ?? bundle.gateway_ws_url;

  if (opts.adapter.init) {
    await opts.adapter.init();
  }

  let client: CloudClientHandle | null = null;

  client = createCloudClient({
    cloudWsUrl,
    agentDid,
    agentPrivateKey: privateKey,
    clientVersion: `arp-cloud-bridge/${opts.adapter.name}`,
    onStateChange: (s) => {
      // eslint-disable-next-line no-console
      console.log(`[bridge] cloud-client state: ${s}`);
    },
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error(`[bridge] cloud-client error: ${err.message}`);
    },
    onIncoming: async (input) => {
      await handleInbound(input, opts.adapter, client!, agentDid, privateKey);
    },
  });

  return {
    agentDid,
    gatewayWsUrl: cloudWsUrl,
    adapterName: opts.adapter.name,
    state: () => (client ? client.state() : 'stopped'),
    async stop() {
      if (client) {
        await client.stop();
        client = null;
      }
    },
  };
}

async function handleInbound(
  input: InboundMessage,
  adapter: Adapter,
  client: CloudClientHandle,
  agentDid: string,
  privateKey: Uint8Array,
): Promise<void> {
  if (input.decision !== 'allow') {
    // eslint-disable-next-line no-console
    console.log(`[bridge] PDP denied inbound from ${input.peerDid ?? 'unknown'}`);
    return;
  }

  const decoded = decodeEnvelopePayload(input.envelope);
  if (!decoded) {
    // eslint-disable-next-line no-console
    console.warn('[bridge] could not decode inbound envelope payload');
    return;
  }

  const peerDid = input.peerDid ?? decoded.from ?? 'unknown';
  const thid = decoded.thid ?? decoded.id ?? null;
  const text =
    typeof decoded.body?.['text'] === 'string'
      ? (decoded.body['text'] as string)
      : JSON.stringify(decoded.body ?? {});

  // eslint-disable-next-line no-console
  console.log(`[bridge] ← ${peerDid}: ${truncate(text, 80)}`);

  let reply: string;
  try {
    reply = await adapter.ask({
      peerDid,
      thid,
      connectionId: input.connectionId,
      text,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[bridge] adapter ${adapter.name} failed:`, (err as Error).message);
    throw err; // no ack → cloud requeues for redelivery
  }

  if (!reply || reply.trim().length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[bridge] adapter returned empty reply; ack-ing without sending response');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[bridge] → ${peerDid}: ${truncate(reply, 80)}`);

  const msgId = randomUUID();
  const env = await signEnvelope({
    message: {
      id: msgId,
      type: 'https://didcomm.org/arp/1.0/response',
      from: agentDid,
      to: [peerDid],
      thid: thid ?? msgId,
      body: { text: reply },
    },
    signerDid: agentDid,
    privateKey,
  });
  await client.sendOutboundEnvelope({
    msgId,
    msgType: 'https://didcomm.org/arp/1.0/response',
    peerDid,
    envelope: env.compact,
    connectionId: input.connectionId,
  });
}

function decodeEnvelopePayload(compact: string): {
  id?: string;
  type?: string;
  from?: string;
  thid?: string;
  body?: Record<string, unknown>;
} | null {
  const parts = compact.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = base64urlDecode(parts[1]!);
    return JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '…';
}
