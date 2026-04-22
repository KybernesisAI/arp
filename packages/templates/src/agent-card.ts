import {
  AgentCardSchema,
  ARP_VERSION,
  SUPPORTED_PROTOCOLS,
  type AgentCard,
  type DidUri,
} from '@kybernesis/arp-spec';
import { validateOrThrow } from './util.js';

export interface BuildAgentCardInput {
  name: string;
  did: DidUri;
  /** One-line description; defaults to "Personal agent". */
  description?: string;
  /** ISO 8601 datetime with offset. Defaults to `new Date().toISOString()`. */
  createdAt?: string;
  endpoints: {
    didcomm: string;
    /** Optional in v0 (stubbed). */
    a2a?: string;
    pairing: string;
  };
  /**
   * Override accepted protocols. Defaults to the canonical `didcomm/v2` +
   * `a2a/1.0` set from `@kybernesis/arp-spec`.
   */
  acceptedProtocols?: readonly string[];
  supportedScopes?: readonly string[];
  payment?: {
    x402Enabled: boolean;
    currencies?: readonly string[];
    pricingUrl?: string | null;
  };
  vcRequirements?: readonly string[];
  /**
   * HTTPS URL of the Cedar policy schema. Defaults to the conventional
   * `<agent-origin>/.well-known/policy-schema.json` when `policySchemaUrl`
   * is omitted and `agentOrigin` is provided.
   */
  policySchemaUrl?: string;
  /** Used to derive the default `policySchemaUrl`. */
  agentOrigin?: string;
}

export function buildAgentCard(input: BuildAgentCardInput): AgentCard {
  const policySchemaUrl =
    input.policySchemaUrl ??
    (input.agentOrigin
      ? `${input.agentOrigin.replace(/\/$/, '')}/.well-known/policy-schema.json`
      : undefined);

  if (!policySchemaUrl) {
    throw new Error(
      'buildAgentCard: either policySchemaUrl or agentOrigin must be provided'
    );
  }

  const card = {
    arp_version: ARP_VERSION,
    name: input.name,
    did: input.did,
    description: input.description ?? 'Personal agent',
    created_at: input.createdAt ?? new Date().toISOString(),
    endpoints: {
      didcomm: input.endpoints.didcomm,
      ...(input.endpoints.a2a ? { a2a: input.endpoints.a2a } : {}),
      pairing: input.endpoints.pairing,
    },
    accepted_protocols: [...(input.acceptedProtocols ?? SUPPORTED_PROTOCOLS)],
    supported_scopes: [...(input.supportedScopes ?? [])],
    payment: {
      x402_enabled: input.payment?.x402Enabled ?? false,
      currencies: [...(input.payment?.currencies ?? [])],
      pricing_url: input.payment?.pricingUrl ?? null,
    },
    vc_requirements: [...(input.vcRequirements ?? [])],
    policy: {
      engine: 'cedar' as const,
      schema: policySchemaUrl,
    },
  };

  return validateOrThrow('buildAgentCard', AgentCardSchema, card);
}
