import {
  HandoffBundleSchema,
  type HandoffBundle,
  type DidUri,
  type PublicKeyMultibase,
  type DnsRecordTag,
} from '@kybernesis/arp-spec';
import { validateOrThrow } from './util.js';

export interface BuildHandoffBundleInput {
  agentDid: DidUri;
  principalDid: DidUri;
  publicKeyMultibase: PublicKeyMultibase;
  /**
   * HTTPS origin of the agent. Used to derive the canonical well-known URLs
   * when individual overrides are not provided.
   */
  agentOrigin: string;
  /** Override well-known URLs (useful when hosting is on a different origin). */
  wellKnownUrls?: {
    did?: string;
    agentCard?: string;
    arp?: string;
  };
  dnsRecordsPublished: readonly DnsRecordTag[];
  /** ISO 8601 cert expiry. */
  certExpiresAt: string;
  /** Bootstrap JWT scoped to the arp-sdk takeover (exp ≤ 15min). */
  bootstrapToken: string;
}

export function buildHandoffBundle(input: BuildHandoffBundleInput): HandoffBundle {
  const origin = input.agentOrigin.replace(/\/$/, '');
  const doc = {
    agent_did: input.agentDid,
    principal_did: input.principalDid,
    public_key_multibase: input.publicKeyMultibase,
    well_known_urls: {
      did: input.wellKnownUrls?.did ?? `${origin}/.well-known/did.json`,
      agent_card:
        input.wellKnownUrls?.agentCard ?? `${origin}/.well-known/agent-card.json`,
      arp: input.wellKnownUrls?.arp ?? `${origin}/.well-known/arp.json`,
    },
    dns_records_published: [...input.dnsRecordsPublished],
    cert_expires_at: input.certExpiresAt,
    bootstrap_token: input.bootstrapToken,
  };

  return validateOrThrow('buildHandoffBundle', HandoffBundleSchema, doc);
}
