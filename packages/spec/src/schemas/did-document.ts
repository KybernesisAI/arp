import { z } from 'zod';
import { DID_URI_REGEX } from '../constants.js';

/**
 * W3C DID Document as served at `/.well-known/did.json`.
 *
 * Source: ARP-tld-integration-spec-v2.md §6.1.
 *
 * Shape is intentionally minimal — we model only what ARP actually consumes
 * (did:web agents with Ed25519 keys, one principal, DIDComm + AgentCard services).
 */

/** DID URI — `did:<method>:<method-specific-id>`. */
export const DidUriSchema = z
  .string()
  .regex(DID_URI_REGEX, { message: 'must be a valid DID URI' });

/** Multibase-encoded Ed25519 public key (z-prefixed base58btc, per W3C Multibase). */
export const PublicKeyMultibaseSchema = z
  .string()
  .regex(/^z[1-9A-HJ-NP-Za-km-z]{40,}$/, {
    message: 'must be multibase z-base58btc (z-prefix)',
  });

/** Verification method entry. Spec §6.1 example uses Ed25519VerificationKey2020. */
export const VerificationMethodSchema = z.object({
  id: z.string().min(1).describe('Verification method ID, e.g. "did:web:samantha.agent#key-1"'),
  type: z
    .literal('Ed25519VerificationKey2020')
    .describe('Only Ed25519VerificationKey2020 is supported in v0'),
  controller: DidUriSchema.describe('DID that controls this verification method'),
  publicKeyMultibase: PublicKeyMultibaseSchema,
});

/**
 * Service endpoint entry.
 *
 * DIDComm services use type `DIDCommMessaging`; agent-card services use `AgentCard`.
 */
export const ServiceEndpointSchema = z.object({
  id: z.string().min(1).describe('Service ID (DID-URL fragment)'),
  type: z
    .enum(['DIDCommMessaging', 'AgentCard'])
    .describe('Service type; v0 supports DIDCommMessaging + AgentCard'),
  serviceEndpoint: z.string().url().describe('HTTPS endpoint URL'),
  accept: z.array(z.string()).min(1).optional().describe('Accepted protocol tokens'),
});

/** Principal binding block. Spec §6.1 `principal`. */
export const PrincipalBindingSchema = z.object({
  did: DidUriSchema.describe('The human principal DID (e.g. did:web:ian.self.xyz)'),
  representationVC: z
    .string()
    .url()
    .describe('HTTPS URL of the signed representation VC (see §6.4)'),
});

/**
 * DID document as served at `/.well-known/did.json` OR synthesised from a
 * `did:key` identifier. Agent documents (did:web) carry `service` + `principal`
 * bindings; owner/principal documents (did:key) are terminal and omit both.
 * Both shapes validate against this schema; higher-layer helpers decide
 * whether a given document has the service + principal bindings an agent
 * requires.
 */
export const DidDocumentSchema = z.object({
  '@context': z
    .array(z.string())
    .refine((ctx) => ctx.includes('https://www.w3.org/ns/did/v1'), {
      message: "'@context' must include 'https://www.w3.org/ns/did/v1'",
    }),
  id: DidUriSchema.describe('The DID being described, e.g. did:web:samantha.agent'),
  controller: DidUriSchema.describe('Controller DID (self-controlling for did:key)'),
  verificationMethod: z.array(VerificationMethodSchema).min(1),
  authentication: z.array(z.string().min(1)).min(1),
  assertionMethod: z.array(z.string().min(1)).min(1),
  keyAgreement: z.array(z.string().min(1)).min(1),
  // service + principal are present on agent documents (did:web) and
  // absent on owner documents (did:key). Both are optional at the schema
  // layer; agent-card consumers must check presence themselves.
  service: z.array(ServiceEndpointSchema).optional(),
  principal: PrincipalBindingSchema.optional(),
});

export type DidUri = z.infer<typeof DidUriSchema>;
export type PublicKeyMultibase = z.infer<typeof PublicKeyMultibaseSchema>;
export type VerificationMethod = z.infer<typeof VerificationMethodSchema>;
export type ServiceEndpoint = z.infer<typeof ServiceEndpointSchema>;
export type PrincipalBinding = z.infer<typeof PrincipalBindingSchema>;
export type DidDocument = z.infer<typeof DidDocumentSchema>;
