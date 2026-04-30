import { describe, expect, it } from 'vitest';

import { loadCatalog } from '@/lib/scope-catalog';
import { SCHEMA_INDEX, allSchemas, getSchema } from '@/lib/schemas';

describe('bundled scope catalog', () => {
  it('ships exactly 51 scopes (50 user-facing + system.trusted.full_access)', () => {
    const { scopes, manifest } = loadCatalog();
    expect(scopes.length).toBe(51);
    expect(manifest.scope_count).toBe(51);
  });

  it('manifest checksum + updated_at are populated', () => {
    const { manifest } = loadCatalog();
    expect(manifest.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(manifest.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('every scope has a matching YAML source', () => {
    const { scopes, yaml } = loadCatalog();
    for (const s of scopes) {
      expect(yaml[s.id], `missing YAML for ${s.id}`).toBeTypeOf('string');
      // Sanity: the YAML source must reference its own id.
      expect(yaml[s.id]).toContain(`id: ${s.id}`);
    }
  });
});

describe('bundled JSON Schemas', () => {
  it('every indexed schema resolves', () => {
    for (const entry of SCHEMA_INDEX) {
      const schema = getSchema(entry.id);
      expect(schema, `missing schema ${entry.id}`).toBeDefined();
    }
  });

  it('allSchemas returns the complete index (no missing bundles)', () => {
    expect(allSchemas().length).toBe(SCHEMA_INDEX.length);
  });

  it('no Self.xyz identifiers in the public schema payloads', () => {
    for (const entry of SCHEMA_INDEX) {
      const payload = JSON.stringify(getSchema(entry.id));
      expect(payload).not.toMatch(/self\.xyz|selfxyz|self_xyz/i);
    }
  });
});
