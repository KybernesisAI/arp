import { describe, it, expect } from 'vitest';
import cedarSchemaJson from '../src/cedar-schema.json' with { type: 'json' };
import { CedarSchemaSchema } from '../src/index.js';

describe('CedarSchemaSchema (structural validation of JSON schema form)', () => {
  it('validates the bundled cedar-schema.json', () => {
    const parsed = CedarSchemaSchema.safeParse(cedarSchemaJson);
    expect(parsed.success).toBe(true);
  });

  it('rejects a schema missing required entityTypes', () => {
    const bad = { ARP: { actions: {} } };
    expect(CedarSchemaSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects malformed type records', () => {
    const bad = {
      ARP: {
        entityTypes: {
          Agent: {
            // missing "shape"
          },
        },
        actions: {},
      },
    };
    expect(CedarSchemaSchema.safeParse(bad).success).toBe(false);
  });
});
