import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { loadScopesFromDirectory } from '../src/index.js';

const SCOPES_DIR = resolve(__dirname, '..', 'scopes');

describe('loadScopesFromDirectory', () => {
  it('loads all 50 scope YAMLs', () => {
    const scopes = loadScopesFromDirectory(SCOPES_DIR);
    expect(scopes).toHaveLength(50);
  });

  it('returns scopes sorted by id', () => {
    const scopes = loadScopesFromDirectory(SCOPES_DIR);
    const ids = scopes.map((s) => s.id);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it('every scope has the correct schema shape (id, version, category, risk)', () => {
    const scopes = loadScopesFromDirectory(SCOPES_DIR);
    for (const scope of scopes) {
      expect(scope.id).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
      expect(scope.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(['low', 'medium', 'high', 'critical']).toContain(scope.risk);
      expect(scope.cedar_template.length).toBeGreaterThan(0);
      expect(scope.consent_text_template.length).toBeGreaterThan(0);
    }
  });

  it('every implied scope id resolves inside the catalog', () => {
    const scopes = loadScopesFromDirectory(SCOPES_DIR);
    const ids = new Set(scopes.map((s) => s.id));
    for (const scope of scopes) {
      for (const implied of scope.implies) {
        expect(ids.has(implied)).toBe(true);
      }
    }
  });

  it('every conflicts_with reference resolves inside the catalog', () => {
    const scopes = loadScopesFromDirectory(SCOPES_DIR);
    const ids = new Set(scopes.map((s) => s.id));
    for (const scope of scopes) {
      for (const conflict of scope.conflicts_with) {
        expect(ids.has(conflict)).toBe(true);
      }
    }
  });
});
