/**
 * v2.1 redirect-back contract: the registrar receives `principal_did`,
 * `public_key_multibase`, and `signed_representation_jwt` as query params
 * appended to its callback URL. Phase 10.5a (Headless integration
 * pre-flight) added `public_key_multibase` so registrars don't have to
 * resolve the DID document just to find the matching key.
 */

import { describe, it, expect } from 'vitest';
import { buildCallback } from '@/app/onboard/OnboardRedirectForm';

describe('OnboardRedirectForm — buildCallback', () => {
  it('appends all three v2.1 redirect-back params and preserves callback path/query', () => {
    const url = buildCallback('https://headless.example/api/v1/arp/domains/samantha.agent/bind?ref=signup', {
      principal_did: 'did:web:cloud.arp.run:u:11111111-2222-3333-4444-555555555555',
      public_key_multibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      signed_representation_jwt: 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ4In0.AAAA',
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://headless.example');
    expect(parsed.pathname).toBe('/api/v1/arp/domains/samantha.agent/bind');
    expect(parsed.searchParams.get('ref')).toBe('signup');
    expect(parsed.searchParams.get('principal_did')).toBe(
      'did:web:cloud.arp.run:u:11111111-2222-3333-4444-555555555555',
    );
    expect(parsed.searchParams.get('public_key_multibase')).toBe(
      'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    );
    expect(parsed.searchParams.get('signed_representation_jwt')).toBe(
      'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ4In0.AAAA',
    );
  });

  it('overwrites any preexisting param with the same name', () => {
    // A registrar that templates principal_did into the callback URL
    // (incorrectly) should still receive the cloud-canonical value.
    const url = buildCallback('https://headless.example/cb?principal_did=stale', {
      principal_did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    });
    expect(new URL(url).searchParams.get('principal_did')).toBe(
      'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    );
  });

  it('encodes special characters in DID method-specific identifiers', () => {
    // did:web with port + path needs URL-encoding when packed into a query
    // param. URLSearchParams.set handles this for us; the assertion
    // verifies the round-trip survives.
    const did = 'did:web:cloud.arp.run%3A8443:u:abc';
    const url = buildCallback('https://headless.example/cb', { principal_did: did });
    expect(new URL(url).searchParams.get('principal_did')).toBe(did);
  });
});
