import { describe, it, expect } from 'vitest';
import { ArpJsonSchema } from '../src/index.js';
import { VALID_ARP_JSON, clone } from './fixtures.js';

describe('ArpJsonSchema', () => {
  it('accepts the reference document', () => {
    expect(ArpJsonSchema.safeParse(VALID_ARP_JSON).success).toBe(true);
  });

  it('rejects empty capabilities', () => {
    const bad = clone(VALID_ARP_JSON);
    bad.capabilities = [];
    expect(ArpJsonSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-URL scope catalog', () => {
    const bad = clone(VALID_ARP_JSON);
    bad.scope_catalog_url = 'not-a-url';
    expect(ArpJsonSchema.safeParse(bad).success).toBe(false);
  });
});
