import { z } from 'zod';
import { DidUriSchema } from './did-document.js';

/**
 * Agent Card served at `/.well-known/agent-card.json`.
 *
 * Source: ARP-tld-integration-spec-v2.md §6.2.
 */

export const PaymentBlockSchema = z.object({
  x402_enabled: z.boolean().describe('Whether this agent accepts x402 payments'),
  currencies: z
    .array(z.string())
    .describe('ISO-like currency/asset codes (e.g. "USDC", "ETH")'),
  pricing_url: z.string().url().nullable().describe('HTTPS URL to the pricing page, or null'),
});

export const PolicyBlockSchema = z.object({
  engine: z
    .literal('cedar')
    .describe('Only Cedar is supported as a PDP engine in v0'),
  schema: z
    .string()
    .url()
    .describe('HTTPS URL to the Cedar schema (typically /.well-known/policy-schema.json)'),
});

export const AgentCardEndpointsSchema = z.object({
  didcomm: z.string().url().describe('DIDComm v2 endpoint'),
  a2a: z.string().url().optional().describe('Agent-to-Agent HTTPS endpoint (stubbed v0)'),
  pairing: z.string().url().describe('Pairing flow entry point'),
});

export const AgentCardSchema = z.object({
  arp_version: z.string().describe('ARP protocol version (e.g. "0.1")'),
  name: z.string().min(1).describe('Human-readable agent name'),
  did: DidUriSchema,
  description: z.string().describe('One-line purpose description'),
  created_at: z.string().datetime({ offset: true }).describe('ISO 8601 timestamp'),
  endpoints: AgentCardEndpointsSchema,
  accepted_protocols: z
    .array(z.string())
    .min(1)
    .describe('Wire protocols this agent accepts'),
  supported_scopes: z
    .array(z.string())
    .describe('Scope IDs from the catalog this agent supports'),
  payment: PaymentBlockSchema,
  vc_requirements: z
    .array(z.string())
    .describe(
      'Peer-counterparty VC type IDs required (e.g. "vc_provider.verified_human"). Opaque strings — the PDP does not interpret them.',
    ),
  policy: PolicyBlockSchema,
});

export type PaymentBlock = z.infer<typeof PaymentBlockSchema>;
export type PolicyBlock = z.infer<typeof PolicyBlockSchema>;
export type AgentCardEndpoints = z.infer<typeof AgentCardEndpointsSchema>;
export type AgentCard = z.infer<typeof AgentCardSchema>;
