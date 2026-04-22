import type { ScopeTemplate, Obligation } from '@kybernesis/arp-spec';
import { compileScope, ScopeCompileError } from './compiler.js';

export interface CompileBundleInput {
  scopeIds: readonly string[];
  paramsMap?: Record<string, Record<string, unknown>>;
  audienceDid: string;
  /** Lookup table from scope id → template. Usually the loader's output. */
  catalog: readonly ScopeTemplate[];
}

export interface CompiledBundle {
  policies: string[];
  obligations: Obligation[];
  /** Fully-expanded scope IDs (original + implied, deduped and topologically sorted). */
  expandedScopeIds: string[];
}

export class BundleCompileError extends Error {
  public readonly scopeId?: string;
  public readonly conflict?: [string, string];

  constructor(message: string, opts?: { scopeId?: string; conflict?: [string, string] }) {
    super(message);
    this.name = 'BundleCompileError';
    if (opts?.scopeId !== undefined) this.scopeId = opts.scopeId;
    if (opts?.conflict !== undefined) this.conflict = opts.conflict;
  }
}

function indexCatalog(catalog: readonly ScopeTemplate[]): Map<string, ScopeTemplate> {
  const map = new Map<string, ScopeTemplate>();
  for (const scope of catalog) {
    map.set(scope.id, scope);
  }
  return map;
}

interface ExpansionResult {
  order: string[];
  /** For each implied scope, the id of the scope that pulled it in. */
  impliedBy: Map<string, string>;
}

/**
 * Transitively expand `implies` relations starting from `seed`.
 * Returns a stable-ordered array: requested scopes first (in their original
 * order), then any implied scopes added by the expansion (in discovery
 * order). Also records the parent that pulled each implied scope in, so
 * callers can inherit parameter values along the implication edge.
 * Guards against cycles.
 */
function expandImplications(
  seed: readonly string[],
  catalog: Map<string, ScopeTemplate>
): ExpansionResult {
  const order: string[] = [];
  const visited = new Set<string>();
  const impliedBy = new Map<string, string>();
  const queue: Array<{ id: string; parent: string | null }> = seed.map((id) => ({
    id,
    parent: null,
  }));

  while (queue.length > 0) {
    const { id, parent } = queue.shift() as { id: string; parent: string | null };
    if (visited.has(id)) continue;
    visited.add(id);
    const scope = catalog.get(id);
    if (!scope) {
      throw new BundleCompileError(`unknown scope id '${id}'`, { scopeId: id });
    }
    order.push(id);
    if (parent !== null && !impliedBy.has(id)) impliedBy.set(id, parent);
    for (const implied of scope.implies) {
      if (!visited.has(implied)) {
        queue.push({ id: implied, parent: id });
      }
    }
  }

  return { order, impliedBy };
}

function detectConflicts(
  expanded: readonly string[],
  catalog: Map<string, ScopeTemplate>
): void {
  const set = new Set(expanded);
  for (const id of expanded) {
    const scope = catalog.get(id);
    // Existence already checked in expandImplications.
    if (!scope) continue;
    for (const conflict of scope.conflicts_with) {
      if (set.has(conflict)) {
        throw new BundleCompileError(
          `scope '${id}' conflicts with '${conflict}' — cannot coexist in the same bundle`,
          { conflict: [id, conflict] }
        );
      }
    }
  }
}

/**
 * Resolve the parameter map for `scopeId`. Starts from any explicit entry in
 * `paramsMap`, then — if the scope was pulled in via implication — walks up
 * the chain and fills in any missing required parameters that the parent
 * scope also declares (e.g., `project_id` propagates from
 * `files.project.files.read` down to its implied `.list` / `.metadata.read`).
 */
function resolveParamsForScope(
  scope: ScopeTemplate,
  paramsMap: Record<string, Record<string, unknown>>,
  impliedBy: Map<string, string>,
  idx: Map<string, ScopeTemplate>
): Record<string, unknown> {
  const own = { ...(paramsMap[scope.id] ?? {}) };
  let parentId = impliedBy.get(scope.id);
  while (parentId) {
    const parentParams = paramsMap[parentId];
    if (parentParams) {
      for (const [k, v] of Object.entries(parentParams)) {
        if (own[k] === undefined) own[k] = v;
      }
    }
    // follow any further implication chain (e.g., A→B→C)
    const grandparentId = impliedBy.get(parentId);
    parentId = grandparentId && grandparentId !== parentId ? grandparentId : undefined;
  }
  // nothing more to do — missing required-with-default params are handled by
  // the per-scope compiler using catalog defaults.
  void idx; // reserved for richer inheritance in the future
  return own;
}

/**
 * Compile a bundle of scopes into a Cedar policy string list + aggregated
 * obligations.
 *
 * Semantics:
 *   1. Expand `implies` transitively (user-requested ids first, implied
 *      later). Each implied scope remembers which scope pulled it in.
 *   2. Check `conflicts_with` across the expanded set; throw if any pair
 *      conflicts.
 *   3. Compile each scope using `compileScope`. Implied scopes inherit any
 *      required parameters (`project_id`, `collection_id`, …) from the
 *      scope that implied them if the caller didn't provide their own
 *      `paramsMap` entry.
 *   4. Concatenate `obligations_forced` from every expanded scope into the
 *      bundle's obligations array.
 */
export function compileBundle({
  scopeIds,
  paramsMap = {},
  audienceDid,
  catalog,
}: CompileBundleInput): CompiledBundle {
  const idx = indexCatalog(catalog);
  const { order, impliedBy } = expandImplications(scopeIds, idx);
  detectConflicts(order, idx);

  const policies: string[] = [];
  const obligations: Obligation[] = [];

  for (const id of order) {
    const scope = idx.get(id);
    if (!scope) continue;
    const params = resolveParamsForScope(scope, paramsMap, impliedBy, idx);
    try {
      policies.push(
        compileScope({
          scope,
          audienceDid,
          params,
        })
      );
    } catch (e) {
      if (e instanceof ScopeCompileError) throw e;
      throw new BundleCompileError(
        `failed to compile scope '${id}': ${(e as Error).message}`,
        { scopeId: id }
      );
    }
    for (const ob of scope.obligations_forced) {
      obligations.push({ type: ob.type, params: ob.params });
    }
  }

  return { policies, obligations, expandedScopeIds: order };
}
