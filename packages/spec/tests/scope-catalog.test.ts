import { describe, it, expect } from 'vitest';
import {
  ScopeTemplateSchema,
  ScopeCatalogManifestSchema,
  type ScopeTemplate,
} from '../src/index.js';
import { VALID_SCOPE_TEMPLATE, clone } from './fixtures.js';

describe('ScopeTemplateSchema', () => {
  it('accepts the reference scope template', () => {
    expect(ScopeTemplateSchema.safeParse(VALID_SCOPE_TEMPLATE).success).toBe(true);
  });

  it('rejects non-dotted scope ids', () => {
    const bad = clone(VALID_SCOPE_TEMPLATE);
    bad.id = 'not-dotted';
    expect(ScopeTemplateSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid risk tier', () => {
    const bad = clone(VALID_SCOPE_TEMPLATE) as unknown as { risk: string };
    bad.risk = 'urgent';
    expect(ScopeTemplateSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-semver version', () => {
    const bad = clone(VALID_SCOPE_TEMPLATE);
    bad.version = '1.0';
    expect(ScopeTemplateSchema.safeParse(bad).success).toBe(false);
  });

  it('defaults parameters/obligations_forced/implies/conflicts_with when omitted', () => {
    const minimal: Omit<
      ScopeTemplate,
      'parameters' | 'obligations_forced' | 'implies' | 'conflicts_with' | 'step_up_required'
    > = {
      id: 'identity.card.read',
      version: '1.0.0',
      label: 'Read agent card',
      description: 'See your public agent card.',
      category: 'identity',
      risk: 'low',
      cedar_template:
        'permit (principal == Agent::"{{audience_did}}", action == Action::"read", resource == AgentCard::"self");',
      consent_text_template: 'See your public agent card.',
    };
    const parsed = ScopeTemplateSchema.parse(minimal);
    expect(parsed.parameters).toEqual([]);
    expect(parsed.obligations_forced).toEqual([]);
    expect(parsed.implies).toEqual([]);
    expect(parsed.conflicts_with).toEqual([]);
    expect(parsed.step_up_required).toBe(false);
  });
});

describe('ScopeCatalogManifestSchema', () => {
  it('validates a minimal manifest', () => {
    const manifest = {
      version: 'v1',
      updated_at: '2026-04-22T00:00:00Z',
      scope_count: 1,
      checksum: `sha256:${'0'.repeat(64)}`,
      scopes: [VALID_SCOPE_TEMPLATE],
    };
    expect(ScopeCatalogManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('rejects malformed checksum', () => {
    const manifest = {
      version: 'v1',
      updated_at: '2026-04-22T00:00:00Z',
      scope_count: 0,
      checksum: 'sha1:abc',
      scopes: [],
    };
    expect(ScopeCatalogManifestSchema.safeParse(manifest).success).toBe(false);
  });
});
