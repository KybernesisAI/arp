import { z } from 'zod';

/**
 * Scope template data model.
 *
 * Source: ARP-scope-catalog-v1.md §1 (shape), §2 (risk tiers), §3 (categories),
 *         §9 (parameter types), §10 (versioning), §13 (governance).
 *
 * The full v1 catalog — 50 scopes — is authored as YAML files in the
 * `@kybernesis/arp-scope-catalog` package. This schema is the contract.
 */

export const RiskTierSchema = z.enum(['low', 'medium', 'high', 'critical']);

export const ScopeCategorySchema = z.enum([
  'identity',
  'calendar',
  'messaging',
  'files',
  'contacts',
  'tasks',
  'notes',
  'payments',
  'work',
  'credentials',
  'tools',
  'delegation',
  'location',
  'health',
]);

export const ParameterTypeSchema = z.enum([
  'Integer',
  'Decimal',
  'Duration',
  'ProjectID',
  'AgentDID',
  'AgentDIDList',
  'ToolIDList',
  'AttributeList',
  'EmailList',
  'IANATimezone',
  'Enum',
  'Timezone',
]);

export const ScopeParameterSchema = z.object({
  name: z.string().min(1),
  type: ParameterTypeSchema,
  required: z.boolean(),
  default: z.unknown().optional().describe('Default value; type must match `type`'),
  validation: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      'Validation spec — regex, range string (e.g. "1..90"), or enum values array'
    ),
});

/** Obligation entry embedded in a scope template. */
export const ScopeObligationSchema = z.object({
  type: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const ScopeTemplateSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, {
      message: 'scope id must be dotted lowercase, e.g. "files.project.files.read"',
    }),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, { message: 'version must be semver' }),
  label: z.string().min(1),
  description: z.string().min(1),
  category: ScopeCategorySchema,
  risk: RiskTierSchema,
  parameters: z.array(ScopeParameterSchema).default([]),
  cedar_template: z.string().min(1).describe('Handlebars-templated Cedar policy source'),
  consent_text_template: z.string().min(1),
  obligations_forced: z.array(ScopeObligationSchema).default([]),
  implies: z.array(z.string()).default([]),
  conflicts_with: z.array(z.string()).default([]),
  tier_gate: z
    .string()
    .optional()
    .describe('Minimum VC type required (e.g. "self_xyz.verified_human")'),
  step_up_required: z.boolean().default(false),
});

/**
 * Catalog manifest — what we expose at `/.well-known/scope-catalog.json`.
 *
 * `checksum` is the SHA-256 hex of the deterministic JCS serialization of the
 * `scopes` array (sorted by id).
 */
export const ScopeCatalogManifestSchema = z.object({
  version: z.string().describe('Catalog version (e.g. "v1")'),
  updated_at: z.string().datetime({ offset: true }),
  scope_count: z.number().int().nonnegative(),
  checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  scopes: z.array(ScopeTemplateSchema),
});

export type RiskTier = z.infer<typeof RiskTierSchema>;
export type ScopeCategory = z.infer<typeof ScopeCategorySchema>;
export type ParameterType = z.infer<typeof ParameterTypeSchema>;
export type ScopeParameter = z.infer<typeof ScopeParameterSchema>;
export type ScopeObligation = z.infer<typeof ScopeObligationSchema>;
export type ScopeTemplate = z.infer<typeof ScopeTemplateSchema>;
export type ScopeCatalogManifest = z.infer<typeof ScopeCatalogManifestSchema>;
