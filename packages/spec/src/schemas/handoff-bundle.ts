import { z } from 'zod';
import { DidUriSchema, PublicKeyMultibaseSchema } from './did-document.js';

/**
 * Handoff bundle — returned to the buyer's browser at the end of the
 * registrar-side bootstrap flow. The arp-sdk consumes it to take over runtime
 * operation.
 *
 * Source: ARP-tld-integration-spec-v2.md §7 step 14 +
 *         ARP-installation-and-hosting.md §2.
 */

/** The set of DNS-record types the registrar published. */
export const DnsRecordTagSchema = z.enum([
  'A',
  'AAAA',
  '_arp TXT',
  '_did TXT',
  '_didcomm TXT',
  '_revocation TXT',
  '_principal TXT',
]);

export const WellKnownUrlsSchema = z.object({
  did: z.string().url().describe('HTTPS URL of /.well-known/did.json'),
  agent_card: z.string().url().describe('HTTPS URL of /.well-known/agent-card.json'),
  arp: z.string().url().describe('HTTPS URL of /.well-known/arp.json'),
});

export const HandoffBundleSchema = z.object({
  agent_did: DidUriSchema.describe('Agent DID (did:web:<sld>.agent)'),
  principal_did: DidUriSchema.describe('Bound principal DID'),
  public_key_multibase: PublicKeyMultibaseSchema,
  well_known_urls: WellKnownUrlsSchema,
  dns_records_published: z.array(DnsRecordTagSchema).min(1),
  cert_expires_at: z
    .string()
    .datetime({ offset: true })
    .describe('ACME cert expiry (ISO 8601)'),
  bootstrap_token: z
    .string()
    .min(1)
    .describe('Short-lived JWT scoped to the arp-sdk takeover (exp 15 min)'),
});

export type DnsRecordTag = z.infer<typeof DnsRecordTagSchema>;
export type WellKnownUrls = z.infer<typeof WellKnownUrlsSchema>;
export type HandoffBundle = z.infer<typeof HandoffBundleSchema>;
