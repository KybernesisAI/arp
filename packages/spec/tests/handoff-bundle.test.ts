import { describe, it, expect } from 'vitest';
import { HandoffBundleSchema } from '../src/index.js';
import { VALID_HANDOFF_BUNDLE, clone } from './fixtures.js';

describe('HandoffBundleSchema', () => {
  it('accepts the reference bundle', () => {
    expect(HandoffBundleSchema.safeParse(VALID_HANDOFF_BUNDLE).success).toBe(true);
  });

  it('rejects missing well_known_urls', () => {
    const bad = clone(VALID_HANDOFF_BUNDLE) as unknown as { well_known_urls?: unknown };
    delete bad.well_known_urls;
    expect(HandoffBundleSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unrecognised DNS record tags', () => {
    const bad: Record<string, unknown> = clone(VALID_HANDOFF_BUNDLE);
    bad.dns_records_published = ['MX'];
    expect(HandoffBundleSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty dns_records_published', () => {
    const bad = clone(VALID_HANDOFF_BUNDLE);
    bad.dns_records_published = [];
    expect(HandoffBundleSchema.safeParse(bad).success).toBe(false);
  });

  it('round-trips cleanly through JSON', () => {
    const roundtrip = JSON.parse(JSON.stringify(VALID_HANDOFF_BUNDLE));
    const parsed = HandoffBundleSchema.parse(roundtrip);
    expect(parsed).toEqual(VALID_HANDOFF_BUNDLE);
  });
});
