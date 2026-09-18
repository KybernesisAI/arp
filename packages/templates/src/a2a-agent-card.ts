import {
  A2aAgentCardSchema,
  A2A_PROTOCOL_VERSION,
  ARP_A2A_EXTENSION_URI,
  WELL_KNOWN_PATHS,
  type A2aAgentCard,
  type DidUri,
} from '@kybernesis/arp-spec';
import { validateOrThrow } from './util.js';

export interface BuildA2aAgentCardInput {
  name: string;
  description?: string;
  did: DidUri;
  /** Origin that serves this identity to the ICANN world, e.g. `https://samantha.agent.arp.run`. */
  origin: string;
  /** Where a counterparty requests a connection. */
  pairUrl: string;
  /** Owner / operator display for `provider`. */
  provider?: { organization: string; url?: string };
  /** Scope ids the identity currently exposes (from active connections / catalog). */
  scopes?: readonly string[];
  /** Card version string; bump when the card changes materially. Defaults to "1". */
  version?: string;
  /** Icon for directories. */
  iconUrl?: string;
}

/**
 * Build the A2A v1.0 agent card for a `.agent` identity (AgentID S5 / A1).
 * The mirror origin is the JSON-RPC endpoint; ARP rides as an extension so an
 * A2A client learns where the ARP card, DID document and pairing live.
 * `signatures` are added by `signAgentCard` (transport) after building.
 */
export function buildA2aAgentCard(input: BuildA2aAgentCardInput): A2aAgentCard {
  const origin = input.origin.replace(/\/+$/, '');
  const card = {
    name: input.name,
    description: input.description ?? 'Personal agent',
    supportedInterfaces: [
      { url: `${origin}${WELL_KNOWN_PATHS.A2A_ENDPOINT}`, protocolBinding: 'JSONRPC' as const, protocolVersion: A2A_PROTOCOL_VERSION },
    ],
    ...(input.provider ? { provider: input.provider } : {}),
    version: input.version ?? '1',
    documentationUrl: 'https://docs.arp.run',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [
        {
          uri: ARP_A2A_EXTENSION_URI,
          description: 'ARP: consented, scoped, audited agent-to-agent connections. Pair first; the connection token is the bearer credential.',
          required: true,
          params: {
            did: input.did,
            arpCard: `${origin}${WELL_KNOWN_PATHS.AGENT_CARD}`,
            didDocument: `${origin}${WELL_KNOWN_PATHS.DID}`,
            pair: input.pairUrl,
            ...(input.scopes && input.scopes.length > 0 ? { scopes: [...input.scopes] } : {}),
          },
        },
      ],
    },
    securitySchemes: {
      arp: { type: 'http', scheme: 'bearer', bearerFormat: 'ARP connection token', description: 'Issued by pairing; scoped to one connection.' },
    },
    securityRequirements: [{ arp: [] }],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [
      {
        id: 'converse',
        name: 'Converse',
        description: 'Send a message to this agent within an approved connection and receive its reply.',
        tags: ['arp', 'messaging'],
        inputModes: ['text/plain'],
        outputModes: ['text/plain'],
      },
    ],
    ...(input.iconUrl ? { iconUrl: input.iconUrl } : {}),
    protocolVersion: A2A_PROTOCOL_VERSION,
  };
  return validateOrThrow('buildA2aAgentCard', A2aAgentCardSchema, card);
}
