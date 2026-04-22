import { z, type ZodTypeAny } from 'zod';

/**
 * Error thrown when a template output fails its own Zod validation.
 *
 * Template functions are pure — inputs are typed, but defaults, URL
 * composition, and date math still need a schema check before the object
 * leaves the builder.
 */
export class TemplateValidationError extends Error {
  public readonly issues: z.ZodIssue[];

  constructor(templateName: string, issues: z.ZodIssue[]) {
    super(
      `${templateName}: produced invalid output (${issues.length} issue${issues.length === 1 ? '' : 's'})`
    );
    this.name = 'TemplateValidationError';
    this.issues = issues;
  }
}

/**
 * Validate `candidate` against `schema`. Throws `TemplateValidationError` on
 * failure, returns the parsed value on success.
 */
export function validateOrThrow<S extends ZodTypeAny>(
  templateName: string,
  schema: S,
  candidate: unknown
): z.infer<S> {
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    throw new TemplateValidationError(templateName, parsed.error.issues);
  }
  return parsed.data;
}

/**
 * Canonical service ID helper: `<agentDid>#<suffix>`.
 */
export function makeServiceId(agentDid: string, suffix: string): string {
  return `${agentDid}#${suffix}`;
}
