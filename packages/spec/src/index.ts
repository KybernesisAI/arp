/**
 * @kybernesis/arp-spec — shared ARP contract.
 *
 * Exports every Zod schema, inferred type, and protocol constant that ARP
 * implementers (runtime, registrar integrations, SDKs, owner apps) need to
 * agree on. Pure data + validation; no HTTP, filesystem, or network concerns.
 *
 * JSON Schema (draft 2020-12) equivalents are emitted to
 * `@kybernesis/arp-spec/json-schema/*.json` at build time.
 */

export * from './schemas/index.js';
export * from './constants.js';
export * from './types.js';

/**
 * Registry of all schemas by name.
 *
 * Useful for generic tooling (emit-json-schema script, dev-tools, test
 * harnesses) that needs to enumerate every ARP shape without hard-coding the
 * list. Adding a new schema should add an entry here.
 */
import { DidDocumentSchema } from './schemas/did-document.js';
import { AgentCardSchema } from './schemas/agent-card.js';
import { ArpJsonSchema } from './schemas/arp-json.js';
import { RepresentationVcSchema } from './schemas/representation-vc.js';
import { RevocationsSchema } from './schemas/revocations.js';
import { ConnectionTokenSchema } from './schemas/connection-token.js';
import { HandoffBundleSchema } from './schemas/handoff-bundle.js';
import { ScopeCatalogManifestSchema } from './schemas/scope-catalog.js';
import { CedarSchemaSchema } from './schemas/cedar-schema.js';
import type { ZodTypeAny } from 'zod';

/**
 * Schema registry used by the emit-json-schema build step. Exactly 9 entries
 * — one JSON Schema file per ARP document shape.
 *
 * `scope-catalog` is the manifest shape; it transitively references the
 * `ScopeTemplate` shape inside its `scopes` array so downstream consumers get
 * both definitions in one file.
 */
export const SCHEMA_REGISTRY: Readonly<Record<string, ZodTypeAny>> = Object.freeze({
  'did-document': DidDocumentSchema,
  'agent-card': AgentCardSchema,
  'arp-json': ArpJsonSchema,
  'representation-vc': RepresentationVcSchema,
  'revocations': RevocationsSchema,
  'connection-token': ConnectionTokenSchema,
  'handoff-bundle': HandoffBundleSchema,
  'scope-catalog': ScopeCatalogManifestSchema,
  'cedar-schema': CedarSchemaSchema,
});
