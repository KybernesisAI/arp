import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  compileBundle,
  BUNDLES,
  loadScopesFromDirectory,
  BundleCompileError,
  type BundleDefinition,
} from '../src/index.js';
import type { ScopeTemplate } from '@kybernesis/arp-spec';

const SCOPES_DIR = resolve(__dirname, '..', 'scopes');
const AUDIENCE = 'did:web:ghost.agent';

function paramsMapFromBundle(bundle: BundleDefinition): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {};
  for (const entry of bundle.scopes) {
    if (!entry.params) continue;
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(entry.params)) {
      resolved[k] = v === '<user-picks>' ? 'alpha' : v;
    }
    map[entry.id] = resolved;
  }
  return map;
}

describe('compileBundle — all 5 reference bundles', () => {
  const catalog: ScopeTemplate[] = loadScopesFromDirectory(SCOPES_DIR);

  it.each(BUNDLES.map((b) => [b.id, b] as const))(
    'compiles %s end-to-end',
    (_id, bundle) => {
      const result = compileBundle({
        scopeIds: bundle.scopes.map((s) => s.id),
        paramsMap: paramsMapFromBundle(bundle),
        audienceDid: AUDIENCE,
        catalog,
      });
      expect(result.policies.length).toBeGreaterThanOrEqual(bundle.scopes.length);
      for (const policy of result.policies) {
        expect(policy).toContain(AUDIENCE);
        expect(policy).not.toContain('{{');
      }
    }
  );

  it('project_collaboration expands implies (files.project.files.read → list + metadata)', () => {
    const bundle = BUNDLES.find((b) => b.id === 'bundle.project_collaboration.v1')!;
    const result = compileBundle({
      scopeIds: bundle.scopes.map((s) => s.id),
      paramsMap: paramsMapFromBundle(bundle),
      audienceDid: AUDIENCE,
      catalog,
    });
    // files.project.files.list and .metadata.read are already explicit in the
    // bundle, so the expansion is a no-op here. files.project.files.summarize
    // implies files.project.files.read which is also already explicit.
    const ids = new Set(result.expandedScopeIds);
    expect(ids.has('files.project.files.read')).toBe(true);
    expect(ids.has('files.project.files.list')).toBe(true);
  });

  it('scheduling_assistant collects obligations from calendar.events.propose', () => {
    const bundle = BUNDLES.find((b) => b.id === 'bundle.scheduling_assistant.v1')!;
    const result = compileBundle({
      scopeIds: bundle.scopes.map((s) => s.id),
      paramsMap: paramsMapFromBundle(bundle),
      audienceDid: AUDIENCE,
      catalog,
    });
    const hasRequirePrincipalConfirmation = result.obligations.some(
      (o) => o.type === 'require_principal_confirmation'
    );
    expect(hasRequirePrincipalConfirmation).toBe(true);
  });

  it('executive_assistant includes the email + tasks + notes obligation stack', () => {
    const bundle = BUNDLES.find((b) => b.id === 'bundle.executive_assistant.v1')!;
    const result = compileBundle({
      scopeIds: bundle.scopes.map((s) => s.id),
      paramsMap: paramsMapFromBundle(bundle),
      audienceDid: AUDIENCE,
      catalog,
    });
    const types = new Set(result.obligations.map((o) => o.type));
    expect(types.has('audit_level')).toBe(true);
    expect(types.has('require_principal_confirmation')).toBe(true);
  });
});

describe('compileBundle — implications + conflicts', () => {
  const catalog = loadScopesFromDirectory(SCOPES_DIR);

  it('transitively expands implies (files.project.files.summarize → read → list + metadata)', () => {
    const result = compileBundle({
      scopeIds: ['files.project.files.summarize'],
      paramsMap: {
        'files.project.files.summarize': { project_id: 'alpha', max_output_words: 1000 },
        'files.project.files.read': { project_id: 'alpha', max_size_mb: 10 },
        'files.project.files.list': { project_id: 'alpha' },
        'files.project.metadata.read': { project_id: 'alpha' },
      },
      audienceDid: 'did:web:ghost.agent',
      catalog,
    });
    expect(result.expandedScopeIds).toContain('files.project.files.read');
    expect(result.expandedScopeIds).toContain('files.project.files.list');
    expect(result.expandedScopeIds).toContain('files.project.metadata.read');
  });

  it('throws when two scopes conflict (files.project.files.delete ⊥ files.share.external)', () => {
    expect(() =>
      compileBundle({
        scopeIds: ['files.project.files.delete', 'files.share.external'],
        paramsMap: {
          'files.project.files.delete': { project_id: 'alpha' },
          'files.share.external': {
            project_id: 'alpha',
            recipient_allowlist: ['alice@example.com'],
          },
        },
        audienceDid: 'did:web:ghost.agent',
        catalog,
      })
    ).toThrow(BundleCompileError);
  });

  it('throws on unknown scope id', () => {
    expect(() =>
      compileBundle({
        scopeIds: ['made.up.scope'],
        audienceDid: 'did:web:ghost.agent',
        catalog,
      })
    ).toThrow(BundleCompileError);
  });

  // Regression guard for Phase-1 Conservative-Call #4: when the caller supplies
  // paramsMap for a parent scope but NOT for the scopes it implies, the bundle
  // compiler MUST inherit required params along the implication edge.
  // Removing this behavior would mean every bundle author has to duplicate
  // `project_id` across every implied scope — the whole reason the inheritance
  // exists. If this test breaks, either the inheritance was removed or the
  // contract changed; do not paper over it by adding explicit paramsMap
  // entries to the test.
  it('inherits parent paramsMap along implication chain when implied scope is omitted', () => {
    const result = compileBundle({
      scopeIds: ['files.project.files.summarize'],
      paramsMap: {
        // Only the parent is declared. The implied scopes
        // (files.project.files.read → .list → .metadata.read) each also
        // require `project_id`, and must pick it up from the parent.
        'files.project.files.summarize': { project_id: 'alpha', max_output_words: 1000 },
      },
      audienceDid: 'did:web:ghost.agent',
      catalog,
    });

    // All implied scopes should have compiled (not thrown on missing param).
    expect(result.expandedScopeIds).toEqual(
      expect.arrayContaining([
        'files.project.files.summarize',
        'files.project.files.read',
        'files.project.files.list',
        'files.project.metadata.read',
      ])
    );

    // Each compiled policy should contain the inherited project_id, proving
    // the param propagated rather than silently defaulted to something else.
    for (const policy of result.policies) {
      expect(policy).toContain('Project::"alpha"');
    }
  });

  // Caller overrides take precedence over inherited values.
  it('caller-supplied paramsMap on an implied scope overrides the parent', () => {
    const result = compileBundle({
      scopeIds: ['files.project.files.summarize'],
      paramsMap: {
        'files.project.files.summarize': { project_id: 'alpha', max_output_words: 1000 },
        'files.project.files.read':      { project_id: 'beta',  max_size_mb: 10 },
      },
      audienceDid: 'did:web:ghost.agent',
      catalog,
    });

    const readPolicy = result.policies.find((p) => p.includes('Action::"read"'));
    const summarizePolicy = result.policies.find((p) => p.includes('Action::"summarize"'));
    expect(readPolicy).toBeDefined();
    expect(summarizePolicy).toBeDefined();
    expect(readPolicy!).toContain('Project::"beta"');       // explicit override
    expect(summarizePolicy!).toContain('Project::"alpha"'); // explicit parent
  });
});
