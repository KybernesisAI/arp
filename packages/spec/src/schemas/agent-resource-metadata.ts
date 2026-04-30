import { z } from 'zod';

/**
 * Cross-framework metadata vocabulary for agent-side resources.
 *
 * Source of truth for the attributes ARP scope policies care about — the
 * same `project_id` an issuer types into the scope picker is the same one
 * KyberBot's brain stamps onto a memory, the same one a typed
 * /api/arp/notes.search filters by. Defining it here in @kybernesis/arp-spec
 * means any ARP-aware framework imports the canonical shape rather than
 * inventing its own.
 *
 * Phase A foundation for the ARP/KyberBot unification roadmap. Other
 * frameworks adopting ARP get the same vocabulary at no extra design cost.
 *
 * Expected lifecycle:
 *   - The framework's data layer (kyberbot brain, mastra store, …) tags
 *     each row with these attributes when the row is created or imported.
 *   - The framework's typed ARP endpoints filter by these attributes when
 *     responding to a peer request — never by the peer's claimed values
 *     (those go through the cloud PDP); always by the row's stamped
 *     attributes (defense in depth).
 *   - The cloud PDP evaluates Cedar policies that reference the same
 *     names (project_id, classification, tags) — keeps the picker UX, the
 *     wire-level claim, and the data-layer filter all aligned.
 */

/**
 * Sensitivity tier of a resource. Drives default obligations (e.g.,
 * `redact_fields_except` is enforced more strictly on `pii`/`confidential`
 * than on `public`). Frameworks should default to `internal` when the
 * source can't be determined.
 */
export const ResourceClassificationSchema = z.enum([
  'public',
  'internal',
  'confidential',
  'pii',
]);

export type ResourceClassification = z.infer<typeof ResourceClassificationSchema>;

/**
 * Per-resource metadata that makes ARP policy decisions enforceable at the
 * data layer. All fields optional — adding metadata to existing rows is a
 * gradual migration; the absence of a field means "unscoped" and matches
 * any policy that doesn't constrain that dimension.
 *
 * Field semantics:
 *
 *   project_id     A string scoping the resource to a named project. The
 *                  same value the issuer types into a scope picker
 *                  parameter (e.g. `files.project.files.read project_id=alpha`).
 *                  Frameworks SHOULD use slugged identifiers, not human names.
 *
 *   tags           Free-form tags. Useful when policies expand to
 *                  tag-allowlists (e.g. "share notes tagged `marketing` or
 *                  `roadmap` only"). Cedar policies can reference
 *                  `resource.tags.contains("marketing")`.
 *
 *   classification Sensitivity tier (see ResourceClassificationSchema). The
 *                  cedar templates can short-circuit on classification —
 *                  e.g. `forbid when resource.classification == "pii"`.
 *
 *   connection_id  ARP connection id that produced or owns this resource.
 *                  When set, the resource is conceptually "owned by" that
 *                  connection — useful for "forget everything peer X told
 *                  us" (DELETE WHERE connection_id = ?). Memories created
 *                  outside an ARP context should leave this null.
 *
 *   source_did     Agent DID that contributed this resource (the peer in
 *                  an ARP conversation, or the local agent itself when no
 *                  peer is involved). Lets frameworks attribute provenance
 *                  without parsing connection state.
 */
export const AgentResourceMetadataSchema = z.object({
  project_id: z
    .string()
    .regex(/^[A-Za-z0-9._-]+$/, {
      message:
        'project_id must be alphanumeric (._- allowed) — matches the ProjectID parameter type in the scope catalog',
    })
    .optional(),
  tags: z.array(z.string().min(1)).optional(),
  classification: ResourceClassificationSchema.optional(),
  connection_id: z
    .string()
    .regex(/^conn_[A-Za-z0-9_-]{4,}$/)
    .optional(),
  source_did: z
    .string()
    .regex(/^did:[a-z0-9]+:.+/)
    .optional(),
});

export type AgentResourceMetadata = z.infer<typeof AgentResourceMetadataSchema>;
