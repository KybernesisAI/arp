/**
 * Scope ID → Cedar action verb + resource template mapping.
 *
 * The typed CLI (`arpc request <peer> <scope-id> ...`) puts the full scope
 * ID in `body.action` (e.g. `notes.search`). The compiled cedar policy on
 * the connection uses a hand-picked verb (`search`) and a parameterised
 * resource (`Collection::"alpha"`). Without translation, the PDP sees a
 * mismatch on both axes and denies every typed request.
 *
 * This module imports the pre-built scope catalog JSON directly (the
 * `generated/scopes.json` artifact shipped by @kybernesis/arp-scope-catalog).
 * That avoids runtime filesystem lookup, which is fragile across ESM/CJS
 * and pnpm-deploy'd flattened images. Bundlers (tsup) inline the JSON.
 */

import scopesJson from '@kybernesis/arp-scope-catalog/generated/scopes.json' with { type: 'json' };

export interface ScopeResourceTemplate {
  /** Cedar entity type, e.g. "Collection", "Calendar", "Document". */
  type: string;
  /** Body parameter name whose value becomes the entity id. Null = literal id. */
  idParam: string | null;
  /** Literal id used when idParam is null. */
  literalId?: string;
}

interface ScopeMapping {
  cedarAction: string;
  resource: ScopeResourceTemplate | null;
}

interface ScopeJson {
  id: string;
  cedar_template: string;
}

let cachedMap: Map<string, ScopeMapping> | null = null;

function buildMap(): Map<string, ScopeMapping> {
  const map = new Map<string, ScopeMapping>();
  const scopes = scopesJson as ScopeJson[];
  for (const scope of scopes) {
    const actionMatch = scope.cedar_template.match(/action == Action::"([^"]+)"/);
    if (!actionMatch || !actionMatch[1]) continue;
    let resource: ScopeResourceTemplate | null = null;
    const tplMatch = scope.cedar_template.match(
      /resource (?:==|in) ([A-Za-z_][A-Za-z0-9_]*)::"\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}"/,
    );
    if (tplMatch && tplMatch[1] && tplMatch[2]) {
      resource = { type: tplMatch[1], idParam: tplMatch[2] };
    } else {
      const litMatch = scope.cedar_template.match(
        /resource (?:==|in) ([A-Za-z_][A-Za-z0-9_]*)::"([^"{}]+)"/,
      );
      if (litMatch && litMatch[1] && litMatch[2]) {
        resource = { type: litMatch[1], idParam: null, literalId: litMatch[2] };
      }
    }
    map.set(scope.id, { cedarAction: actionMatch[1], resource });
  }
  // eslint-disable-next-line no-console
  console.info(`[action-map] loaded ${map.size} scopes from bundled catalog`);
  return map;
}

function getMap(): Map<string, ScopeMapping> {
  if (!cachedMap) cachedMap = buildMap();
  return cachedMap;
}

/**
 * Translate a scope-id-shaped action (e.g. `notes.search`) to its cedar
 * action verb (e.g. `search`) so PDP evaluation matches the compiled
 * policy. Returns the input unchanged when no mapping exists.
 */
export function scopeIdToCedarAction(action: string): string {
  return getMap().get(action)?.cedarAction ?? action;
}

/**
 * Look up the cedar resource template for a known scope id. Used by
 * dispatch to construct the request `resource` from the body's parameter
 * values when the caller didn't pass an explicit `body.resource`.
 */
export function scopeIdToResourceTemplate(action: string): ScopeResourceTemplate | null {
  return getMap().get(action)?.resource ?? null;
}

/** Test-only: reset the module cache so tests can swap fixture catalogs. */
export function _resetActionMapCacheForTests(): void {
  cachedMap = null;
}
