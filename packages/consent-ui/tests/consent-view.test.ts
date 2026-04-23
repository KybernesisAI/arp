import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadScopesFromDirectory,
  BUNDLES,
} from '@kybernesis/arp-scope-catalog';
import type { ScopeTemplate } from '@kybernesis/arp-spec';
import { renderConsentView } from '../src/index.js';
import { POLICY_EXAMPLES } from './fixtures.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCOPES_DIR = resolve(__dirname, '..', '..', 'scope-catalog', 'scopes');
const CATALOG: readonly ScopeTemplate[] = loadScopesFromDirectory(SCOPES_DIR);

describe('renderConsentView — worked examples from ARP-policy-examples.md', () => {
  for (const scenario of POLICY_EXAMPLES) {
    it(scenario.name, () => {
      const view = renderConsentView({
        ...scenario.input,
        catalog: CATALOG,
      });
      expect(view).toMatchSnapshot();
    });
  }
});

describe('renderConsentView — the five bundles in ARP-scope-catalog-v1.md §6', () => {
  for (const bundle of BUNDLES) {
    it(bundle.id, () => {
      const scopeSelections = bundle.scopes.map((s) => {
        const sel: { id: string; params?: Record<string, unknown> } = { id: s.id };
        if (s.params) sel.params = normalizeBundleParams(s.params);
        return sel;
      });
      const view = renderConsentView({
        issuer: 'did:web:ian.self.xyz',
        subject: 'did:web:samantha.agent',
        audience: 'did:web:ghost.agent',
        purpose: bundle.label,
        scopeSelections,
        cedarPolicies: [],
        obligations: [],
        expires: '2026-10-22T00:00:00Z',
        catalog: CATALOG,
      });
      expect(view).toMatchSnapshot();
    });
  }
});

/**
 * Bundle definitions sometimes carry `<user-picks>` sentinels to indicate
 * consent-time user input. For snapshot rendering we substitute a stable
 * placeholder so the output stays deterministic.
 */
function normalizeBundleParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = v === '<user-picks>' ? `<${k}>` : v;
  }
  return out;
}
