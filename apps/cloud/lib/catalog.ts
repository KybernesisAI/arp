import { resolve } from 'node:path';
import { loadScopesFromDirectory } from '@kybernesis/arp-scope-catalog';
import type { ScopeTemplate } from '@kybernesis/arp-spec';

/**
 * Resolve the 50-scope catalog at runtime. Runs once per Node process; caches
 * for subsequent calls. Mirrors the owner-app helper — dev path resolves
 * relative to this file, Vercel bundle falls back to a staged copy under
 * `scope-catalog-scopes/` for environments where the workspace layout isn't
 * preserved.
 */
let cached: readonly ScopeTemplate[] | null = null;

export function getScopeCatalog(): readonly ScopeTemplate[] {
  if (cached) return cached;
  const candidates = [
    process.env['ARP_SCOPE_CATALOG_DIR'],
    resolve(process.cwd(), '..', '..', 'packages', 'scope-catalog', 'scopes'),
    resolve(process.cwd(), 'scope-catalog-scopes'),
  ].filter((c): c is string => typeof c === 'string');

  for (const candidate of candidates) {
    try {
      const scopes = loadScopesFromDirectory(candidate);
      cached = scopes;
      return cached;
    } catch {
      continue;
    }
  }
  throw new Error(`scope catalog not found; tried: ${candidates.join(', ')}`);
}
