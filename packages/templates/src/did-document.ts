import {
  DidDocumentSchema,
  type DidDocument,
  type DidUri,
  type PublicKeyMultibase,
} from '@kybernesis/arp-spec';
import { validateOrThrow, makeServiceId } from './util.js';

export interface BuildDidDocumentInput {
  /** Agent DID (e.g. "did:web:samantha.agent"). */
  agentDid: DidUri;
  /** Principal (controller) DID. May be a placeholder pre-binding. */
  controllerDid: DidUri;
  /** Ed25519 public key in multibase (z-base58btc). */
  publicKeyMultibase: PublicKeyMultibase;
  /** Service endpoints. */
  endpoints: {
    didcomm: string;
    agentCard: string;
  };
  /** Representation VC URL served on the owner subdomain. */
  representationVcUrl: string;
  /** Optional verification-method key id suffix. Defaults to `key-1`. */
  keyId?: string;
}

/**
 * Build a W3C DID Document conforming to ARP-tld-integration-spec-v2 §6.1.
 *
 * The output is validated against `DidDocumentSchema` before return; on
 * failure a `TemplateValidationError` is thrown.
 */
export function buildDidDocument(input: BuildDidDocumentInput): DidDocument {
  const keyId = input.keyId ?? 'key-1';
  const verificationMethodId = makeServiceId(input.agentDid, keyId);

  const doc = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: input.agentDid,
    controller: input.controllerDid,
    verificationMethod: [
      {
        id: verificationMethodId,
        type: 'Ed25519VerificationKey2020' as const,
        controller: input.agentDid,
        publicKeyMultibase: input.publicKeyMultibase,
      },
    ],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId],
    keyAgreement: [verificationMethodId],
    service: [
      {
        id: makeServiceId(input.agentDid, 'didcomm'),
        type: 'DIDCommMessaging' as const,
        serviceEndpoint: input.endpoints.didcomm,
        accept: ['didcomm/v2'],
      },
      {
        id: makeServiceId(input.agentDid, 'agent-card'),
        type: 'AgentCard' as const,
        serviceEndpoint: input.endpoints.agentCard,
      },
    ],
    principal: {
      did: input.controllerDid,
      representationVC: input.representationVcUrl,
    },
  };

  return validateOrThrow('buildDidDocument', DidDocumentSchema, doc);
}
