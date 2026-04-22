import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkParsePolicySet } from '@cedar-policy/cedar-wasm';
import {
  loadScopesFromDirectory,
  compileBundle,
  BUNDLES,
  type BundleDefinition,
} from '@kybernesis/arp-scope-catalog';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCOPES_DIR = resolve(__dirname, '../../packages/scope-catalog/scopes');
const AUDIENCE = 'did:web:ghost.agent';

function paramsMapFromBundle(bundle: BundleDefinition): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {};
  for (const entry of bundle.scopes) {
    if (!entry.params) continue;
    const resolvedParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(entry.params)) {
      resolvedParams[k] = v === '<user-picks>' ? 'alpha' : v;
    }
    map[entry.id] = resolvedParams;
  }
  return map;
}

describe('Phase 1 acceptance: loaded bundle → compiled Cedar parses with @cedar-policy/cedar-wasm', () => {
  const catalog = loadScopesFromDirectory(SCOPES_DIR);

  it.each(BUNDLES.map((b) => [b.id, b] as const))(
    '%s bundle compiles + every policy parses as Cedar',
    (_id, bundle) => {
      const compiled = compileBundle({
        scopeIds: bundle.scopes.map((s) => s.id),
        paramsMap: paramsMapFromBundle(bundle),
        audienceDid: AUDIENCE,
        catalog,
      });

      expect(compiled.policies.length).toBeGreaterThan(0);

      for (const policy of compiled.policies) {
        const result = checkParsePolicySet(policy);
        if (result.type !== 'success') {
          throw new Error(
            `Cedar parse failed for one of ${bundle.id}'s policies:\n${policy}\n\nErrors: ${JSON.stringify(result.errors, null, 2)}`
          );
        }
        expect(result.policies + result.templates).toBeGreaterThan(0);
      }
    }
  );
});
