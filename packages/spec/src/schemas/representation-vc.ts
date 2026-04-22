import { z } from 'zod';
import { DidUriSchema } from './did-document.js';

/**
 * Representation VC — a principal's signed attestation that a given agent
 * represents them. Payload of the JWT served at
 * `{owner-subdomain}/.well-known/representation.jwt`.
 *
 * Source: ARP-tld-integration-spec-v2.md §6.4.
 */

export const RepresentationConstraintsSchema = z.object({
  maxConcurrentConnections: z
    .number()
    .int()
    .nonnegative()
    .describe('Upper bound on simultaneously-active connections'),
  allowedTransferOfOwnership: z
    .boolean()
    .describe('Whether the representation survives agent ownership transfer (v0.2+)'),
});

export const VerifiableCredentialSchema = z.object({
  '@context': z
    .array(z.string())
    .refine((ctx) => ctx.includes('https://www.w3.org/2018/credentials/v1'), {
      message: "'@context' must include 'https://www.w3.org/2018/credentials/v1'",
    }),
  type: z
    .array(z.string())
    .refine(
      (ts) => ts.includes('VerifiableCredential') && ts.includes('AgentRepresentation'),
      { message: "type must include 'VerifiableCredential' and 'AgentRepresentation'" }
    ),
  credentialSubject: z.object({
    id: DidUriSchema.describe('Agent DID being represented'),
    representedBy: DidUriSchema.describe('Principal DID doing the representing'),
    scope: z.enum(['full', 'scoped']).describe('Representation scope'),
    constraints: RepresentationConstraintsSchema,
  }),
});

export const RepresentationVcSchema = z.object({
  iss: DidUriSchema.describe('Issuer = principal DID'),
  sub: DidUriSchema.describe('Subject = agent DID'),
  iat: z.number().int().nonnegative().describe('Issued-at (Unix seconds)'),
  exp: z.number().int().positive().describe('Expiry (Unix seconds)'),
  vc: VerifiableCredentialSchema,
});

export type RepresentationConstraints = z.infer<typeof RepresentationConstraintsSchema>;
export type VerifiableCredential = z.infer<typeof VerifiableCredentialSchema>;
export type RepresentationVc = z.infer<typeof RepresentationVcSchema>;
