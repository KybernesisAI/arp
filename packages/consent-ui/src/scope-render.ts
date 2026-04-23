import Handlebars from 'handlebars';
import type { Obligation, ScopeTemplate } from '@kybernesis/arp-spec';
import type { ScopeSelection } from '@kybernesis/arp-pairing';

const ATTRIBUTE_HUMAN: Record<string, string> = {
  verified_human: 'a verified human',
  over_18: 'over 18',
  over_21: 'over 21',
  us_resident: 'a US resident',
  country: 'a resident of a given country',
};

const SCOPE_ATTENUATION_HUMAN: Record<string, string> = {
  read_only: 'read-only',
  same_scopes: 'the same',
  custom: 'caller-specified',
};

/**
 * Render a single scope's `consent_text_template` against its user-supplied
 * params. Unfilled parameters fall back to the template's `default`.
 *
 * Derived helpers exposed to every template:
 *   - `<name>_display` for list-shaped params (joined with ", ")
 *   - `project.name` when a `project_id` param is present
 *   - `attribute_human` when an `attribute` enum param is present
 *   - `scope_attenuation_human` when `scope_attenuation` is present
 *
 * These mirror the helpers the scope-catalog compiler wires up for Cedar,
 * but targeted at the English consent strings. The catalog's templates
 * reference them directly, so missing them would produce empty-word bullets.
 */
export function renderScopeConsentText(
  scope: ScopeTemplate,
  params: Record<string, unknown> = {},
): string {
  const ctx = buildScopeContext(scope, params);
  const template = Handlebars.compile(scope.consent_text_template, {
    noEscape: true,
  });
  return template(ctx).trim();
}

/**
 * Substitute Handlebars refs in a scope's `obligations_forced` params using
 * the same context the consent template sees. The scope catalog embeds refs
 * like `max_words: "{{max_output_words}}"`; without this pass they'd flow
 * into the consent view verbatim and the obligation renderer couldn't
 * interpret the numeric caps.
 */
export function materializeObligation(
  scope: ScopeTemplate,
  params: Record<string, unknown>,
  obligation: Obligation,
): Obligation {
  const ctx = buildScopeContext(scope, params);
  const materialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obligation.params ?? {})) {
    materialized[key] = materializeValue(value, ctx);
  }
  return { type: obligation.type, params: materialized };
}

function buildScopeContext(
  scope: ScopeTemplate,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const filled: Record<string, unknown> = {};
  for (const def of scope.parameters) {
    if (params[def.name] !== undefined) {
      filled[def.name] = params[def.name];
    } else if (def.default !== undefined) {
      filled[def.name] = def.default;
    }
  }
  const ctx: Record<string, unknown> = { ...filled };
  for (const [key, value] of Object.entries(filled)) {
    if (Array.isArray(value)) {
      ctx[`${key}_display`] = value.map((v) => String(v)).join(', ');
      ctx[`${key}_json`] = JSON.stringify(value);
    }
  }
  if (typeof filled.project_id === 'string') {
    ctx.project = { name: filled.project_id };
  }
  if (typeof filled.attribute === 'string' && filled.attribute in ATTRIBUTE_HUMAN) {
    ctx.attribute_human = ATTRIBUTE_HUMAN[filled.attribute];
  }
  if (
    typeof filled.scope_attenuation === 'string' &&
    filled.scope_attenuation in SCOPE_ATTENUATION_HUMAN
  ) {
    ctx.scope_attenuation_human = SCOPE_ATTENUATION_HUMAN[filled.scope_attenuation];
  }
  return ctx;
}

function materializeValue(value: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof value === 'string' && value.includes('{{')) {
    const rendered = Handlebars.compile(value, { noEscape: true })(ctx);
    const n = Number(rendered);
    return Number.isFinite(n) && rendered.trim() !== '' ? n : rendered;
  }
  if (Array.isArray(value)) {
    return value.map((v) => materializeValue(v, ctx));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = materializeValue(v, ctx);
    }
    return out;
  }
  return value;
}

/**
 * Index a catalog by scope id. Throws a clear error when any selection
 * references an unknown scope — consent-ui must never silently drop a bullet.
 */
export function indexCatalog(
  catalog: readonly ScopeTemplate[],
  selections: readonly ScopeSelection[],
): Map<string, ScopeTemplate> {
  const map = new Map<string, ScopeTemplate>();
  for (const s of catalog) map.set(s.id, s);
  for (const sel of selections) {
    if (!map.has(sel.id)) {
      throw new Error(`unknown scope '${sel.id}' in consent input`);
    }
  }
  return map;
}
