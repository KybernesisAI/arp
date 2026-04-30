/**
 * Scope ID → Cedar action verb mapping.
 *
 * The typed CLI (`arpc request <peer> <scope-id> ...`) puts the full scope
 * ID in `body.action` (e.g. `notes.search`, `files.project.files.read`).
 * Each scope template's compiled cedar policy uses a hand-picked verb
 * (`search`, `read`, `propose_meeting`, `relay_to_principal`, etc.) that
 * is shorter and not a 1:1 transformation of the scope ID. Without
 * normalisation, every typed `arpc request` evaluates to a cedar action
 * that doesn't appear in any policy → permanent deny.
 *
 * This module loads the scope catalog at module-init time, parses each
 * scope's cedar template to extract the `Action::"X"` enum, and exposes
 * a fast lookup. Plain-text path (`relay_to_principal`) doesn't go
 * through here — dispatch hardcodes that mapping.
 *
 * Falls back to the verbatim action when no scope is registered for an
 * id, so unknown / future actions still flow through cedar evaluation
 * as-is. The PDP itself is the source of truth for allow/deny.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';
import { loadScopesFromDirectory } from '@kybernesis/arp-scope-catalog';

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

let cachedMap: Map<string, ScopeMapping> | null = null;

/**
 * Locate `packages/scope-catalog/scopes` relative to the @kybernesis/arp-
 * scope-catalog package. Works from both local workspace (pnpm) and a
 * normal `node_modules` install (production gateway deploy).
 */
function locateScopesDir(): string | null {
  // 1. Try node_modules path: @kybernesis/arp-scope-catalog/scopes
  try {
    const pkgPath = require.resolve('@kybernesis/arp-scope-catalog/package.json');
    const dir = resolvePath(dirname(pkgPath), 'scopes');
    if (existsSync(dir)) return dir;
  } catch {
    /* not installed via node_modules; fall through */
  }
  // 2. Try monorepo path relative to this file
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidate = resolvePath(here, '../../scope-catalog/scopes');
    if (existsSync(candidate)) return candidate;
  } catch {
    /* import.meta unavailable in some contexts */
  }
  return null;
}

function buildMap(): Map<string, ScopeMapping> {
  const dir = locateScopesDir();
  if (!dir) return new Map();
  const scopes = loadScopesFromDirectory(dir);
  const map = new Map<string, ScopeMapping>();
  for (const scope of scopes) {
    const actionMatch = scope.cedar_template.match(/action == Action::"([^"]+)"/);
    if (!actionMatch || !actionMatch[1]) continue;
    // Cedar resource clauses come in two shapes:
    //   resource == Type::"literal"   (no parameter)
    //   resource in Type::"{{param}}" (parameter substituted at compile time)
    //   resource == Type::"{{param}}" (rare but valid)
    let resource: ScopeResourceTemplate | null = null;
    const tplMatch = scope.cedar_template.match(/resource (?:==|in) ([A-Za-z_][A-Za-z0-9_]*)::"\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}"/);
    if (tplMatch && tplMatch[1] && tplMatch[2]) {
      resource = { type: tplMatch[1], idParam: tplMatch[2] };
    } else {
      const litMatch = scope.cedar_template.match(/resource (?:==|in) ([A-Za-z_][A-Za-z0-9_]*)::"([^"{}]+)"/);
      if (litMatch && litMatch[1] && litMatch[2]) {
        resource = { type: litMatch[1], idParam: null, literalId: litMatch[2] };
      }
    }
    map.set(scope.id, { cedarAction: actionMatch[1], resource });
  }
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
