import {
  checkParseSchema,
  isAuthorized,
  type AuthorizationCall,
  type CedarValueJson,
  type EntityJson,
} from '@cedar-policy/cedar-wasm';
import type { Entity } from './types.js';

export function assertSchemaParses(schemaJson: string): void {
  const trimmed = schemaJson.trim();
  if (!trimmed) return;
  const r = checkParseSchema(trimmed);
  if (r.type !== 'success') {
    throw new Error(
      `Cedar schema failed to parse: ${JSON.stringify(r.errors, null, 2)}`,
    );
  }
}

/**
 * Convert a plain JS value into the Cedar JSON form accepted by
 * `@cedar-policy/cedar-wasm`. Arrays stay arrays, objects stay objects,
 * primitives stay primitives. Dates serialise to their ISO string.
 */
export function toCedarValue(value: unknown): CedarValueJson {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`non-finite number cannot be encoded for Cedar: ${value}`);
    }
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(toCedarValue);
  }
  if (typeof value === 'object') {
    const out: Record<string, CedarValueJson> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toCedarValue(v);
    }
    return out;
  }
  throw new Error(`unsupported Cedar value type: ${typeof value}`);
}

export function toContext(
  ctx: Record<string, unknown> | undefined,
): Record<string, CedarValueJson> {
  if (!ctx) return {};
  const out: Record<string, CedarValueJson> = {};
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = toCedarValue(v);
  }
  return out;
}

export function entityToJson(entity: Entity): EntityJson {
  return {
    uid: { type: entity.type, id: entity.id },
    attrs: entity.attrs
      ? Object.fromEntries(
          Object.entries(entity.attrs).map(([k, v]) => [k, toCedarValue(v)]),
        )
      : {},
    parents: (entity.parents ?? []).map((p) => ({ type: p.type, id: p.id })),
  };
}

export interface CedarCallParts {
  call: AuthorizationCall;
}

export function buildCedarCall(opts: {
  policies: Record<string, string> | string;
  principal: Entity;
  action: string;
  resource: Entity;
  context?: Record<string, unknown>;
  entities?: Entity[];
  actionType?: string;
}): AuthorizationCall {
  const actionType = opts.actionType ?? 'Action';
  const all: Entity[] = [opts.principal, opts.resource, ...(opts.entities ?? [])];
  const seen = new Set<string>();
  const entities: EntityJson[] = [];
  for (const e of all) {
    const key = `${e.type}::${e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entities.push(entityToJson(e));
  }
  return {
    principal: { type: opts.principal.type, id: opts.principal.id },
    action: { type: actionType, id: opts.action },
    resource: { type: opts.resource.type, id: opts.resource.id },
    context: toContext(opts.context),
    slice: {
      policies: opts.policies,
      entities,
      templates: null,
      templateInstantiations: null,
    },
  };
}

export function cedarIsAuthorized(call: AuthorizationCall) {
  return isAuthorized(call);
}
