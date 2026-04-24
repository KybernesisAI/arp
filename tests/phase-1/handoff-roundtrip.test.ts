import { describe, it, expect } from 'vitest';
import { HandoffBundleSchema } from '@kybernesis/arp-spec';
import { buildHandoffBundle } from '@kybernesis/arp-templates';

describe('Phase 1 acceptance: handoff-bundle JSON round-trip', () => {
  it('build → serialize → parse → validate → equals original', () => {
    const original = buildHandoffBundle({
      agentDid: 'did:web:samantha.agent',
      principalDid: 'did:web:ian.example.agent',
      publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
      agentOrigin: 'https://samantha.agent',
      dnsRecordsPublished: [
        'A',
        '_arp TXT',
        '_did TXT',
        '_didcomm TXT',
        '_principal TXT',
      ],
      certExpiresAt: '2026-07-22T00:00:00Z',
      bootstrapToken: 'eyJhbGciOiJFZERTQSJ9.payload.sig',
    });

    const serialized = JSON.stringify(original);
    const parsed = HandoffBundleSchema.parse(JSON.parse(serialized));

    expect(parsed).toEqual(original);
  });
});
