import { resolve } from 'node:path';
import { loadScopesFromDirectory } from '@kybernesis/arp-scope-catalog';
import type { ScopeTemplate } from '@kybernesis/arp-spec';

/**
 * Resolve the scope catalog at runtime. Runs once per Node process; subsequent
 * imports hit the cached value.
 *
 * The catalog lives under the `@kybernesis/arp-scope-catalog` workspace
 * package — in dev we resolve relative to this file, in the sidecar bundle we
 * fall back to the copy the build step stages under
 * `scope-catalog-scopes/`. Both paths converge on the same YAML source of
 * truth.
 */
let cached: readonly ScopeTemplate[] | null = null;

export function getScopeCatalog(): readonly ScopeTemplate[] {
  if (cached) return cached;
  const candidates = [
    process.env.ARP_SCOPE_CATALOG_DIR,
    resolve(
      process.cwd(),
      '..',
      '..',
      'packages',
      'scope-catalog',
      'scopes',
    ),
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
  throw new Error(
    `scope catalog not found; tried: ${candidates.join(', ')}`,
  );
}
