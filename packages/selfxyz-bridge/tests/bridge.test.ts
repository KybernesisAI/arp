import { describe, it, expect } from 'vitest';
import {
  createSelfxyzBridge,
  createMockSelfxyzBridge,
  buildMockPresentation,
  verifyPresentation,
  SUPPORTED_SELFXYZ_VCS,
} from '../src/index.js';

describe('mock bridge happy path', () => {
  it('mints a presentation request and verifies a synthetic response', async () => {
    const bridge = createMockSelfxyzBridge();
    const req = await bridge.requestVcPresentation({
      nonce: 'n1',
      peerDid: 'did:web:ghost.agent',
      requiredVcs: ['self_xyz.verified_human', 'self_xyz.over_18'],
      callbackUrl: 'https://ian.samantha.agent/api/auth/selfxyz-callback',
    });
    expect(req.qrPayload).toContain('n1');
    expect(req.deepLinkUrl).toContain('nonce=n1');
    expect(bridge.requests).toHaveLength(1);

    const presentation = buildMockPresentation({
      nonce: 'n1',
      peerDid: 'did:web:ghost.agent',
      vcs: ['self_xyz.verified_human', 'self_xyz.over_18'],
    });
    const verdict = await bridge.verifyPresentation(
      presentation,
      ['self_xyz.verified_human', 'self_xyz.over_18'],
      { expectedNonce: 'n1' },
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.attributes['self_xyz.verified_human']).toBeDefined();
  });

  it('rejects a missing required VC', async () => {
    const bridge = createMockSelfxyzBridge();
    const presentation = buildMockPresentation({
      nonce: 'n2',
      peerDid: 'did:web:ghost.agent',
      vcs: ['self_xyz.verified_human'],
    });
    const verdict = await bridge.verifyPresentation(presentation, [
      'self_xyz.verified_human',
      'self_xyz.over_21',
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('self_xyz.over_21');
  });

  it('rejects a nonce mismatch', async () => {
    const presentation = buildMockPresentation({
      nonce: 'n3',
      peerDid: 'did:web:ghost.agent',
      vcs: ['self_xyz.verified_human'],
    });
    const verdict = await verifyPresentation(
      presentation,
      ['self_xyz.verified_human'],
      { expectedNonce: 'expected-nonce' },
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('nonce mismatch');
  });

  it('rejects a verified_human VC whose attribute is not verified', async () => {
    const verdict = await verifyPresentation(
      {
        nonce: 'n4',
        peerDid: 'did:web:ghost.agent',
        vcs: [
          { type: 'self_xyz.verified_human', attributes: { verified: false } },
        ],
      },
      ['self_xyz.verified_human'],
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('verified');
  });

  it('validates country as 2-letter ISO', async () => {
    const good = await verifyPresentation(
      {
        nonce: 'n5',
        peerDid: 'did:web:ghost.agent',
        vcs: [{ type: 'self_xyz.country', attributes: { country: 'US' } }],
      },
      ['self_xyz.country'],
    );
    expect(good.ok).toBe(true);

    const bad = await verifyPresentation(
      {
        nonce: 'n5',
        peerDid: 'did:web:ghost.agent',
        vcs: [{ type: 'self_xyz.country', attributes: { country: 'usa' } }],
      },
      ['self_xyz.country'],
    );
    expect(bad.ok).toBe(false);
  });
});

describe('http bridge with mocked fetch', () => {
  it('issues the staging POST and surfaces the response', async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(String(url)).toContain('staging.self.xyz');
      expect(init?.method).toBe('POST');
      return new Response(
        JSON.stringify({
          qrPayload: 'selfxyz://req/xyz',
          deepLinkUrl: 'https://staging.self.xyz/app?req=xyz',
          callbackUrl: 'https://cb',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const bridge = createSelfxyzBridge({ fetchImpl, appId: 'arp-owner-app' });
    const req = await bridge.requestVcPresentation({
      nonce: 'abc',
      peerDid: 'did:web:ghost.agent',
      requiredVcs: ['self_xyz.verified_human'],
      callbackUrl: 'https://cb',
    });
    expect(req.qrPayload).toBe('selfxyz://req/xyz');
  });

  it('surfaces a non-2xx response as an error', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response('boom', { status: 500 });
    const bridge = createSelfxyzBridge({ fetchImpl });
    await expect(
      bridge.requestVcPresentation({
        nonce: 'abc',
        peerDid: 'did:web:ghost.agent',
        requiredVcs: ['self_xyz.verified_human'],
        callbackUrl: 'https://cb',
      }),
    ).rejects.toThrow(/500/);
  });
});

describe('supported VC list', () => {
  it('exposes exactly the v0 five', () => {
    expect(SUPPORTED_SELFXYZ_VCS).toEqual([
      'self_xyz.verified_human',
      'self_xyz.over_18',
      'self_xyz.over_21',
      'self_xyz.us_resident',
      'self_xyz.country',
    ]);
  });
});
