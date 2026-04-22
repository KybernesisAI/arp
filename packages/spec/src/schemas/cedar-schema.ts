import { z } from 'zod';

/**
 * Structural Zod schema for Cedar *schema JSON* (not Cedar policy syntax!).
 *
 * Source: ARP-policy-examples.md §8.
 *
 * The authoritative copy ships alongside this module at
 * `@kybernesis/arp-spec/cedar-schema.json`. This Zod schema lets consumers
 * validate any Cedar schema document (including extensions we haven't seen
 * yet) before feeding it to the `@cedar-policy/cedar-wasm` engine.
 */

export const CedarTypeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal('String') }),
    z.object({ type: z.literal('Long') }),
    z.object({ type: z.literal('Boolean') }),
    z.object({
      type: z.literal('Set'),
      element: CedarTypeSchema,
    }),
    z.object({
      type: z.literal('Record'),
      attributes: z.record(z.string(), CedarTypeSchema),
    }),
    z.object({ type: z.literal('Entity'), name: z.string().min(1) }),
    z.object({ type: z.literal('Extension'), name: z.string().min(1) }),
  ])
);

export const CedarEntityTypeSchema = z.object({
  memberOfTypes: z.array(z.string()).optional(),
  shape: z.object({
    type: z.literal('Record'),
    attributes: z.record(z.string(), CedarTypeSchema),
  }),
});

export const CedarActionSchema = z.object({
  appliesTo: z.object({
    principalTypes: z.array(z.string().min(1)).min(1),
    resourceTypes: z.array(z.string().min(1)).min(1),
    context: z
      .object({
        type: z.literal('Record'),
        attributes: z.record(z.string(), CedarTypeSchema),
      })
      .optional(),
  }),
  memberOf: z
    .array(z.object({ id: z.string().min(1), type: z.string().min(1).optional() }))
    .optional(),
});

export const CedarNamespaceSchema = z.object({
  entityTypes: z.record(z.string(), CedarEntityTypeSchema),
  actions: z.record(z.string(), CedarActionSchema),
  commonTypes: z.record(z.string(), CedarTypeSchema).optional(),
});

/** A Cedar schema JSON is a top-level object keyed by namespace. */
export const CedarSchemaSchema = z.record(z.string(), CedarNamespaceSchema);

export type CedarEntityType = z.infer<typeof CedarEntityTypeSchema>;
export type CedarAction = z.infer<typeof CedarActionSchema>;
export type CedarNamespace = z.infer<typeof CedarNamespaceSchema>;
export type CedarSchema = z.infer<typeof CedarSchemaSchema>;
