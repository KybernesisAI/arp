import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkParseSchema, checkParsePolicySet, getCedarVersion } from '@cedar-policy/cedar-wasm';

/**
 * Acceptance test for Task 13 — parse the bundled Cedar schema + a sample
 * policy (from ARP-policy-examples.md §3 Layer 2) with @cedar-policy/cedar-wasm
 * and confirm the schema is well-formed and the policy is syntactically valid.
 *
 * Note: `checkParsePolicySet` is a pure parser — it does not type-check
 * against the schema. Type-checking comes in Phase 2 via `validate(...)`.
 */

const CEDAR_SCHEMA_PATH = resolve(__dirname, '..', 'src', 'cedar-schema.json');

// Minimal valid Cedar policy from ARP-policy-examples.md §3 Layer 2.
const SAMPLE_POLICY = `
permit (
    principal == Agent::"did:web:ghost.agent",
    action in [Action::"read", Action::"list"],
    resource in Project::"alpha"
);
`;

describe('Cedar schema parse (Task 13)', () => {
  it('reports a working Cedar engine version', () => {
    const v = getCedarVersion();
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  });

  it('parses the ARP Cedar schema (schema JSON form) without error', () => {
    const raw = readFileSync(CEDAR_SCHEMA_PATH, 'utf8');
    const result = checkParseSchema(raw);
    if (result.type !== 'success') {
      // Print errors to make debugging easier if this ever regresses.
      throw new Error(
        `Cedar schema parse failed: ${JSON.stringify(result.errors, null, 2)}`
      );
    }
    expect(result.type).toBe('success');
  });

  it('parses a sample permit policy without error', () => {
    const result = checkParsePolicySet(SAMPLE_POLICY);
    if (result.type !== 'success') {
      throw new Error(
        `Policy parse failed: ${JSON.stringify(result.errors, null, 2)}`
      );
    }
    expect(result.policies).toBe(1);
  });
});
