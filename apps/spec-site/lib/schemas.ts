import schemas from '../.generated/schemas.json' with { type: 'json' };

/**
 * Minimal JSON-Schema shape we actually render. We accept `unknown` for
 * fields we don't navigate; the viewer walks `properties`, `required`,
 * and a handful of structural keywords.
 */
export type JsonSchema = {
  $id?: string;
  $schema?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  examples?: unknown[];
  default?: unknown;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
};

export type SchemaId =
  | 'agent-card'
  | 'arp-json'
  | 'cedar-schema'
  | 'connection-token'
  | 'did-document'
  | 'handoff-bundle'
  | 'representation-vc'
  | 'revocations'
  | 'scope-catalog';

const SCHEMA_MAP = schemas as unknown as Record<SchemaId, JsonSchema>;

export const SCHEMA_INDEX: Array<{
  id: SchemaId;
  title: string;
  description: string;
}> = [
  {
    id: 'did-document',
    title: 'DID Document',
    description:
      'Published at `/.well-known/did.json` by every `.agent` domain. Lists the agent\'s verification methods, service endpoints, and principal binding.',
  },
  {
    id: 'agent-card',
    title: 'Agent Card',
    description:
      'Public advertisement of an agent — supported scopes, scope-catalog pointer, contact endpoints. Served at `/.well-known/arp/agent-card.json`.',
  },
  {
    id: 'arp-json',
    title: 'arp.json — capabilities root',
    description:
      'Enumerates the well-known documents + version an ARP endpoint serves. Served at `/.well-known/arp/arp.json`.',
  },
  {
    id: 'connection-token',
    title: 'Connection Token',
    description:
      'Signed grant representing an approved pairing between two agents. Includes scopes, obligations, and the Cedar policy hash.',
  },
  {
    id: 'representation-vc',
    title: 'Representation VC',
    description:
      'Verifiable Credential that binds an agent to its principal. Signed by the principal, served at the owner subdomain\'s `/.well-known/representation.jwt`.',
  },
  {
    id: 'revocations',
    title: 'Revocations',
    description:
      'Public list of revoked connection tokens. Served at `/.well-known/arp/revocations.json`; counterparties poll on a short interval.',
  },
  {
    id: 'handoff-bundle',
    title: 'Handoff Bundle',
    description:
      'Shape of the downloadable archive a user takes from one install mode to another (e.g. local → cloud).',
  },
  {
    id: 'cedar-schema',
    title: 'Cedar Schema',
    description:
      'Meta-schema for the Cedar fragments ARP ships. Defines the entity / action namespace used by every scope in the catalog.',
  },
  {
    id: 'scope-catalog',
    title: 'Scope Catalog',
    description:
      'Shape of `generated/scopes.json` — the compiled form of the 50 scope templates.',
  },
];

export function getSchema(id: SchemaId): JsonSchema | undefined {
  return SCHEMA_MAP[id];
}

export function allSchemas(): typeof SCHEMA_INDEX {
  return SCHEMA_INDEX.filter((s) => Boolean(SCHEMA_MAP[s.id]));
}
