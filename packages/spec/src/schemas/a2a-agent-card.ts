import { z } from 'zod';

/**
 * A2A v1.0 Agent Card (Linux Foundation Agent2Agent protocol), JSON form of
 * `specification/a2a.proto` `AgentCard`. Served at
 * `/.well-known/agent-card.json` — the path the standard owns. ARP's own card
 * moved to `/.well-known/arp-card.json` and rides inside this card as the
 * extension `https://arp.run/ext/arp/v1` (see ARP_A2A_EXTENSION_URI).
 *
 * Only the fields ARP emits or validates are strict; unknown fields pass
 * through so cards from other implementations still parse.
 */

export const A2aAgentInterfaceSchema = z
  .object({
    url: z.string().url().describe('Endpoint URL for this binding'),
    protocolBinding: z.enum(['JSONRPC', 'GRPC', 'HTTP+JSON']).describe('Transport binding'),
    protocolVersion: z.string().min(1).describe('A2A protocol version, e.g. "1.0"'),
    tenant: z.string().optional().describe('Tenant selector for multi-tenant endpoints'),
  })
  .passthrough();

export const A2aAgentExtensionSchema = z
  .object({
    uri: z.string().min(1).describe('Extension URI'),
    description: z.string().optional(),
    required: z.boolean().optional(),
    params: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const A2aAgentCapabilitiesSchema = z
  .object({
    streaming: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    extensions: z.array(A2aAgentExtensionSchema).optional(),
    extendedAgentCard: z.boolean().optional(),
  })
  .passthrough();

export const A2aAgentSkillSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    tags: z.array(z.string()).optional(),
    examples: z.array(z.string()).optional(),
    inputModes: z.array(z.string()).optional(),
    outputModes: z.array(z.string()).optional(),
  })
  .passthrough();

export const A2aAgentCardSignatureSchema = z
  .object({
    protected: z.string().min(1).describe('base64url JWS protected header'),
    signature: z.string().min(1).describe('base64url JWS signature'),
    header: z.record(z.unknown()).optional().describe('JWS unprotected header'),
  })
  .passthrough();

export const A2aSecuritySchemeSchema = z
  .object({
    type: z.string().min(1),
    scheme: z.string().optional(),
    bearerFormat: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

export const A2aAgentCardSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    supportedInterfaces: z.array(A2aAgentInterfaceSchema).min(1),
    provider: z.object({ organization: z.string(), url: z.string().url().optional() }).passthrough().optional(),
    version: z.string().min(1),
    documentationUrl: z.string().url().optional(),
    capabilities: A2aAgentCapabilitiesSchema,
    securitySchemes: z.record(A2aSecuritySchemeSchema).optional(),
    securityRequirements: z.array(z.record(z.array(z.string()))).optional(),
    defaultInputModes: z.array(z.string()),
    defaultOutputModes: z.array(z.string()),
    skills: z.array(A2aAgentSkillSchema),
    signatures: z.array(A2aAgentCardSignatureSchema).optional(),
    iconUrl: z.string().url().optional(),
    protocolVersion: z.string().min(1).optional(),
  })
  .passthrough();

export type A2aAgentInterface = z.infer<typeof A2aAgentInterfaceSchema>;
export type A2aAgentExtension = z.infer<typeof A2aAgentExtensionSchema>;
export type A2aAgentSkill = z.infer<typeof A2aAgentSkillSchema>;
export type A2aAgentCardSignature = z.infer<typeof A2aAgentCardSignatureSchema>;
export type A2aAgentCard = z.infer<typeof A2aAgentCardSchema>;

/** Shape of `params` on the ARP extension entry inside an A2A card. */
export const ArpExtensionParamsSchema = z
  .object({
    did: z.string().min(1),
    arpCard: z.string().url().describe('URL of the ARP card (/.well-known/arp-card.json)'),
    didDocument: z.string().url(),
    pair: z.string().url().describe('Where a counterparty requests a connection'),
    scopes: z.array(z.string()).optional(),
  })
  .passthrough();
export type ArpExtensionParams = z.infer<typeof ArpExtensionParamsSchema>;
