import { describe, it, expect } from 'vitest';
import { ArpJsonSchema } from '@kybernesis/arp-spec';
import { buildArpJson } from '../src/index.js';
import { seededRng, randomHttps } from './helpers.js';

describe('buildArpJson', () => {
  it('produces a schema-valid document with defaults', () => {
    const doc = buildArpJson({ agentOrigin: 'https://samantha.agent' });
    expect(ArpJsonSchema.safeParse(doc).success).toBe(true);
    expect(doc.version).toBe('0.1');
    expect(doc.scope_catalog_url).toBe('https://samantha.agent/.well-known/scope-catalog.json');
    expect(doc.capabilities).toContain('cedar-pdp');
  });

  it('trims trailing slash on agent origin', () => {
    const doc = buildArpJson({ agentOrigin: 'https://samantha.agent/' });
    expect(doc.policy_schema_url).toBe('https://samantha.agent/.well-known/policy-schema.json');
  });

  it('honors caller-supplied capability overrides', () => {
    const doc = buildArpJson({
      agentOrigin: 'https://samantha.agent',
      capabilities: ['didcomm-v2'],
    });
    expect(doc.capabilities).toEqual(['didcomm-v2']);
  });

  const rng = seededRng(0x7e57);
  for (let i = 0; i < 10; i += 1) {
    const origin = randomHttps(rng, '').replace(/\/$/, '');
    it(`property #${i + 1}: random origin yields valid arp.json`, () => {
      const doc = buildArpJson({ agentOrigin: origin });
      expect(ArpJsonSchema.safeParse(doc).success).toBe(true);
    });
  }
});
