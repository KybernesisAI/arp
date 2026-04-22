import Handlebars from 'handlebars';
import { DID_URI_REGEX, type ScopeTemplate, type ScopeParameter } from '@kybernesis/arp-spec';

export class ScopeCompileError extends Error {
  public readonly scopeId?: string;
  public readonly parameter?: string;

  constructor(message: string, opts?: { scopeId?: string; parameter?: string }) {
    super(message);
    this.name = 'ScopeCompileError';
    if (opts?.scopeId !== undefined) this.scopeId = opts.scopeId;
    if (opts?.parameter !== undefined) this.parameter = opts.parameter;
  }
}

function parseRangeValidation(
  validation: string
): { min: number; max: number } | null {
  const match = /^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/.exec(validation);
  if (!match) return null;
  return { min: Number(match[1]), max: Number(match[2]) };
}

function coerceToNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function validateParameter(
  scopeId: string,
  def: ScopeParameter,
  initial: unknown
): unknown {
  let value = initial;
  const present = value !== undefined && value !== null;
  if (!present) {
    if (def.default !== undefined) {
      // Required + default is a valid combo in the catalog — "required" here
      // means the compiler must end up with a value. If the caller omits,
      // fall through to type-validate the default the same way we'd validate
      // a caller-supplied value.
      value = def.default;
    } else if (def.required) {
      throw new ScopeCompileError(
        `missing required parameter '${def.name}' for scope ${scopeId}`,
        { scopeId, parameter: def.name }
      );
    } else {
      return undefined;
    }
  }

  switch (def.type) {
    case 'Integer': {
      const n = coerceToNumber(value);
      if (n === null || !Number.isInteger(n)) {
        throw new ScopeCompileError(
          `parameter '${def.name}' must be an integer`,
          { scopeId, parameter: def.name }
        );
      }
      if (typeof def.validation === 'string') {
        const range = parseRangeValidation(def.validation);
        if (range && (n < range.min || n > range.max)) {
          throw new ScopeCompileError(
            `parameter '${def.name}'=${n} out of range ${def.validation}`,
            { scopeId, parameter: def.name }
          );
        }
      }
      return n;
    }
    case 'Decimal': {
      const n = coerceToNumber(value);
      if (n === null) {
        throw new ScopeCompileError(
          `parameter '${def.name}' must be a number`,
          { scopeId, parameter: def.name }
        );
      }
      if (typeof def.validation === 'string') {
        const range = parseRangeValidation(def.validation);
        if (range && (n < range.min || n > range.max)) {
          throw new ScopeCompileError(
            `parameter '${def.name}'=${n} out of range ${def.validation}`,
            { scopeId, parameter: def.name }
          );
        }
      }
      return n;
    }
    case 'Enum': {
      if (Array.isArray(def.validation) && !def.validation.includes(String(value))) {
        throw new ScopeCompileError(
          `parameter '${def.name}'='${String(value)}' is not one of [${def.validation.join(', ')}]`,
          { scopeId, parameter: def.name }
        );
      }
      return value;
    }
    case 'AgentDID': {
      if (typeof value !== 'string' || !DID_URI_REGEX.test(value)) {
        throw new ScopeCompileError(
          `parameter '${def.name}' must be a valid DID URI`,
          { scopeId, parameter: def.name }
        );
      }
      return value;
    }
    case 'AgentDIDList': {
      if (!Array.isArray(value) || value.length === 0) {
        throw new ScopeCompileError(
          `parameter '${def.name}' must be a non-empty array of DID URIs`,
          { scopeId, parameter: def.name }
        );
      }
      for (const entry of value) {
        if (typeof entry !== 'string' || !DID_URI_REGEX.test(entry)) {
          throw new ScopeCompileError(
            `parameter '${def.name}' contains an invalid DID URI: ${String(entry)}`,
            { scopeId, parameter: def.name }
          );
        }
      }
      return value;
    }
    case 'ToolIDList':
    case 'AttributeList':
    case 'EmailList': {
      if (!Array.isArray(value)) {
        throw new ScopeCompileError(
          `parameter '${def.name}' must be an array`,
          { scopeId, parameter: def.name }
        );
      }
      return value;
    }
    case 'ProjectID': {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new ScopeCompileError(
          `parameter '${def.name}' must be a non-empty string`,
          { scopeId, parameter: def.name }
        );
      }
      return value;
    }
    case 'Duration':
    case 'Timezone':
    case 'IANATimezone': {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new ScopeCompileError(
          `parameter '${def.name}' must be a non-empty string`,
          { scopeId, parameter: def.name }
        );
      }
      return value;
    }
  }
}

/**
 * Build the Handlebars context for a scope template. Derives list-shaped
 * helpers (`<name>_json`, `<name>_display`, and flag-style `<name>_flag` for
 * enum parameters) so Cedar templates stay declarative.
 */
function buildHandlebarsContext(
  audienceDid: string,
  scope: ScopeTemplate,
  validated: Record<string, unknown>
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    audience_did: audienceDid,
    ...validated,
  };

  for (const [key, value] of Object.entries(validated)) {
    if (Array.isArray(value)) {
      ctx[`${key}_json`] = JSON.stringify(value);
      ctx[`${key}_display`] = value.map((v) => String(v)).join(', ');
    }
  }

  // Per-scope helpers. Keeping the catalog's consent_text_template compile
  // path decoupled from the Cedar path would duplicate this for both — we
  // share the same context for both.
  if (scope.id === 'calendar.events.read') {
    ctx.include_private_flag =
      (validated.include_private ?? scope.parameters.find((p) => p.name === 'include_private')?.default) ===
      'yes';
  }

  return ctx;
}

export interface CompileScopeOptions {
  scope: ScopeTemplate;
  params?: Record<string, unknown>;
  audienceDid: string;
}

/**
 * Compile a scope template + parameters + audience DID into a Cedar policy
 * string.
 *
 * - Validates parameters against the scope's declared types + validation
 *   rules (ranges, enum values, DID shape). Throws `ScopeCompileError` on
 *   any mismatch.
 * - Uses Handlebars under the hood; `{{audience_did}}` is always in scope,
 *   plus any validated parameters and the derived `<name>_json` /
 *   `<name>_display` helpers.
 */
export function compileScope({
  scope,
  params = {},
  audienceDid,
}: CompileScopeOptions): string {
  if (!DID_URI_REGEX.test(audienceDid)) {
    throw new ScopeCompileError(`audienceDid '${audienceDid}' is not a valid DID URI`, {
      scopeId: scope.id,
    });
  }

  const validated: Record<string, unknown> = {};
  for (const def of scope.parameters) {
    validated[def.name] = validateParameter(scope.id, def, params[def.name]);
  }

  const ctx = buildHandlebarsContext(audienceDid, scope, validated);

  const template = Handlebars.compile(scope.cedar_template, { noEscape: true });
  const rendered = template(ctx);
  return normalizeBareEntityTypes(rendered.trim());
}

/**
 * Post-process the Handlebars output to produce valid Cedar.
 *
 * Several scope templates in ARP-scope-catalog-v1.md §5 use the shorthand
 * `resource == Tool` (and similar bare-type forms) to mean "any entity of
 * type Tool". Cedar's parser requires an entity UID on the right-hand side
 * of `==`, not a bare type name — the idiomatic form is `resource is Tool`.
 *
 * We rewrite `<scope> == <TypeName>` → `<scope> is <TypeName>` whenever the
 * right-hand side is a bare UpperCamelCase identifier (no `::"..."` UID and
 * no lower-case head, which would indicate a variable or attribute access).
 *
 * Keeps the YAML sources faithful to the spec doc while guaranteeing the
 * compiled output parses with @cedar-policy/cedar-wasm.
 */
function normalizeBareEntityTypes(cedar: string): string {
  return cedar.replace(
    /(principal|resource)\s*==\s*([A-Z][A-Za-z0-9_]*)(?=\s*[,)\n])/g,
    '$1 is $2'
  );
}
