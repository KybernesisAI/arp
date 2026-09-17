import { describe, expect, it } from 'vitest';
import { getScopeCatalog } from '../lib/catalog';

describe('getScopeCatalog (bundled JSON, no filesystem lookup)', () => {
  it('loads the full catalog from the generated artifact', () => {
    const scopes = getScopeCatalog();
    expect(scopes.length).toBeGreaterThanOrEqual(50);
    expect(scopes.some((s) => s.id === 'calendar.availability.read')).toBe(true);
    expect(scopes.some((s) => s.id === 'system.trusted.full_access')).toBe(true);
  });

  it('is cached across calls', () => {
    expect(getScopeCatalog()).toBe(getScopeCatalog());
  });
});
