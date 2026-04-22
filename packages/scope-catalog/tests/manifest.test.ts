import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  buildCatalogManifest,
  canonicalize,
  loadScopesFromDirectory,
  sha256Hex,
} from '../src/index.js';

const SCOPES_DIR = resolve(__dirname, '..', 'scopes');

describe('buildCatalogManifest', () => {
  it('produces a schema-valid manifest for the full catalog', () => {
    const scopes = loadScopesFromDirectory(SCOPES_DIR);
    const manifest = buildCatalogManifest(scopes, {
      updatedAt: '2026-04-22T00:00:00Z',
    });
    expect(manifest.version).toBe('v1');
    expect(manifest.scope_count).toBe(50);
    expect(manifest.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(manifest.scopes).toHaveLength(50);
  });

  it('checksum is deterministic across two runs with the same input', () => {
    const scopes = loadScopesFromDirectory(SCOPES_DIR);
    const a = buildCatalogManifest(scopes, { updatedAt: '2026-01-01T00:00:00Z' });
    const b = buildCatalogManifest(scopes, { updatedAt: '2026-06-06T06:06:06Z' });
    expect(a.checksum).toBe(b.checksum);
  });

  it('checksum changes when a scope changes', () => {
    const scopes = loadScopesFromDirectory(SCOPES_DIR);
    const modified = [
      { ...scopes[0]!, description: `${scopes[0]!.description} (modified)` },
      ...scopes.slice(1),
    ];
    const a = buildCatalogManifest(scopes, { updatedAt: '2026-01-01T00:00:00Z' });
    const b = buildCatalogManifest(modified, { updatedAt: '2026-01-01T00:00:00Z' });
    expect(a.checksum).not.toBe(b.checksum);
  });
});

describe('canonicalize', () => {
  it('sorts object keys', () => {
    const a = canonicalize({ b: 1, a: 2 });
    const b = canonicalize({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('produces a stable hash', () => {
    const payload = { foo: ['bar', 1, true], baz: null };
    expect(sha256Hex(canonicalize(payload))).toMatch(/^[0-9a-f]{64}$/);
  });
});
