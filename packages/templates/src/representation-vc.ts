import {
  RepresentationVcSchema,
  type RepresentationVc,
  type DidUri,
} from '@kybernesis/arp-spec';
import { validateOrThrow } from './util.js';

export interface BuildRepresentationVcInput {
  /** Principal DID (the human doing the representing). */
  principalDid: DidUri;
  /** Agent DID (the agent being represented). */
  agentDid: DidUri;
  /** Issued-at (Unix seconds). Defaults to now. */
  iat?: number;
  /** Expiry (Unix seconds). Defaults to iat + 1 year. */
  exp?: number;
  /** Representation scope. Defaults to "full". */
  scope?: 'full' | 'scoped';
  constraints?: {
    maxConcurrentConnections?: number;
    allowedTransferOfOwnership?: boolean;
  };
}

const DEFAULT_MAX_CONCURRENT_CONNECTIONS = 100;
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function buildRepresentationVc(input: BuildRepresentationVcInput): RepresentationVc {
  const iat = input.iat ?? Math.floor(Date.now() / 1000);
  const exp = input.exp ?? iat + ONE_YEAR_SECONDS;

  const doc = {
    iss: input.principalDid,
    sub: input.agentDid,
    iat,
    exp,
    vc: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'AgentRepresentation'],
      credentialSubject: {
        id: input.agentDid,
        representedBy: input.principalDid,
        scope: input.scope ?? ('full' as const),
        constraints: {
          maxConcurrentConnections:
            input.constraints?.maxConcurrentConnections ?? DEFAULT_MAX_CONCURRENT_CONNECTIONS,
          allowedTransferOfOwnership: input.constraints?.allowedTransferOfOwnership ?? false,
        },
      },
    },
  };

  return validateOrThrow('buildRepresentationVc', RepresentationVcSchema, doc);
}
