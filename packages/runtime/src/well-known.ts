import {
  buildDidDocument,
  buildAgentCard,
  buildA2aAgentCard,
  buildArpJson,
} from '@kybernesis/arp-templates';
import type { A2aAgentCard, AgentCard, ArpJson, DidDocument } from '@kybernesis/arp-spec';
import type { RuntimeConfig } from './types.js';

export interface WellKnownDocs {
  didDocument: DidDocument;
  /** ARP's own card — served at /.well-known/arp-card.json (AgentID S5). */
  agentCard: AgentCard;
  /** A2A v1.0 card — served at /.well-known/agent-card.json (unsigned on local runtimes in v1). */
  a2aCard: A2aAgentCard;
  arpJson: ArpJson;
}

/**
 * Compute the three standard well-known payloads at boot. The runtime serves
 * the same cached JSON string for every inbound request — no per-request
 * template work.
 */
export function buildWellKnownDocs(config: RuntimeConfig): WellKnownDocs {
  const agentOrigin = originFromUrl(config.wellKnownUrls.arpJson);
  const pairingUrl = `${agentOrigin}/pair`;

  const didDocument = buildDidDocument({
    agentDid: config.did,
    controllerDid: config.principalDid,
    publicKeyMultibase: config.publicKeyMultibase,
    endpoints: {
      didcomm: config.wellKnownUrls.didcomm,
      agentCard: config.wellKnownUrls.agentCard,
    },
    representationVcUrl: config.representationVcUrl,
  });

  const agentCard = buildAgentCard({
    did: config.did,
    name: config.agentName,
    description: config.agentDescription,
    endpoints: {
      didcomm: config.wellKnownUrls.didcomm,
      pairing: pairingUrl,
    },
    supportedScopes: [],
    vcRequirements: [],
    agentOrigin,
  });

  const arpJson = buildArpJson({ agentOrigin });

  const a2aCard = buildA2aAgentCard({
    name: config.agentName,
    description: config.agentDescription,
    did: config.did,
    origin: agentOrigin,
    pairUrl: pairingUrl,
  });

  return { didDocument, agentCard, a2aCard, arpJson };
}

function originFromUrl(fullUrl: string): string {
  const u = new URL(fullUrl);
  return `${u.protocol}//${u.host}`;
}
