import { z } from 'zod';

/**
 * Protocol capability descriptor served at `/.well-known/arp.json`.
 *
 * Source: ARP-tld-integration-spec-v2.md §6.3.
 */

export const ArpJsonSchema = z.object({
  version: z.string().describe('ARP protocol version (e.g. "0.1")'),
  capabilities: z
    .array(z.string())
    .min(1)
    .describe('Capability tokens advertised (e.g. "didcomm-v2", "cedar-pdp", "ucan-tokens")'),
  scope_catalog_url: z
    .string()
    .url()
    .describe('HTTPS URL of the scope catalog JSON this agent honours'),
  policy_schema_url: z
    .string()
    .url()
    .describe('HTTPS URL of the Cedar policy schema'),
});

export type ArpJson = z.infer<typeof ArpJsonSchema>;
