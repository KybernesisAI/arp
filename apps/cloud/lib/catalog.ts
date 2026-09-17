import { resolve } from 'node:path';
import { loadScopesFromDirectory } from '@kybernesis/arp-scope-catalog';
import scopesJson from '@kybernesis/arp-scope-catalog/generated/scopes.json' with { type: 'json' };
import { ScopeTemplateSchema, type ScopeTemplate } from '@kybernesis/arp-spec';

/**
 * Resolve the scope catalog at runtime. Runs once per Node process; caches
 * for subsequent calls.
 *
 * Primary source is the pre-built `generated/scopes.json` artifact shipped by
 * `@kybernesis/arp-scope-catalog` — the same pattern `cloud-runtime` uses.
 * The bundler inlines the JSON, so there is no filesystem lookup on Vercel
 * and no dependency on the monorepo layout being preserved in the function
 * bundle. (The previous `scope-catalog-scopes/` fallback directory was never
 * produced by any build step — flagged in the Aug-2026 deep-read.)
 *
 * `ARP_SCOPE_CATALOG_DIR` remains as an explicit developer override for
 * pointing at a scratch YAML directory without rebuilding the package.
 */
let cached: readonly ScopeTemplate[] | null = null;

export function getScopeCatalog(): readonly ScopeTemplate[] {
  if (cached) return cached;

  const override = process.env['ARP_SCOPE_CATALOG_DIR'];
  if (override) {
    cached = loadScopesFromDirectory(resolve(override));
    return cached;
  }

  const parsed = (scopesJson as unknown[]).map((raw) => ScopeTemplateSchema.parse(raw));
  if (parsed.length === 0) {
    throw new Error('scope catalog is empty — was @kybernesis/arp-scope-catalog built?');
  }
  cached = parsed;
  return cached;
}
