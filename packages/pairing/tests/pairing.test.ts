import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ed25519 from '@noble/ed25519';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { loadScopesFromDirectory } from '@kybernesis/arp-scope-catalog';
import { ConnectionTokenSchema, type DidDocument } from '@kybernesis/arp-spec';
import {
  createPairingProposal,
  buildInvitationUrl,
  parseInvitationUrl,
  countersignProposal,
  verifyConnectionToken,
  verifyPairingProposal,
  type DidResolver,
  type PairingProposal,
  type KeyPair,
} from '../src/index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCOPES_DIR = resolve(__dirname, '..', '..', 'scope-catalog', 'scopes');

async function newKey(kid: string): Promise<{ key: KeyPair; publicKey: Uint8Array }> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  return { key: { privateKey, kid }, publicKey };
}

function didDoc(params: {
  did: string;
  controller: string;
  publicKey: Uint8Array;
  principalDid: string;
  keyId?: string;
}): DidDocument {
  const keyId = params.keyId ?? `${params.did}#key-1`;
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: params.did,
    controller: params.controller,
    verificationMethod: [
      {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: params.did,
        publicKeyMultibase: ed25519RawToMultibase(params.publicKey),
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
    keyAgreement: [keyId],
    service: [
      {
        id: `${params.did}#didcomm`,
        type: 'DIDCommMessaging',
        serviceEndpoint: `https://${params.did.replace('did:web:', '')}/didcomm`,
        accept: ['didcomm/v2'],
      },
    ],
    principal: {
      did: params.principalDid,
      representationVC: `https://${params.did.replace('did:web:', '')}/.well-known/representation.jwt`,
    },
  };
}

function mapResolver(entries: Array<[string, DidDocument]>): DidResolver {
  const map = new Map(entries);
  return {
    async resolve(did) {
      const doc = map.get(did);
      if (!doc) return { ok: false, reason: `unknown DID ${did}` };
      return { ok: true, value: doc };
    },
  };
}

describe('pairing round-trip', () => {
  it('proposal → URL → parse → countersign → verify', async () => {
    const catalog = loadScopesFromDirectory(SCOPES_DIR);

    const ian = await newKey('did:web:ian.self.xyz#key-1');
    const nick = await newKey('did:web:nick.self.xyz#key-1');
    const samantha = await newKey('did:web:samantha.agent#key-1');
    const ghost = await newKey('did:web:ghost.agent#key-1');

    const resolver = mapResolver([
      [
        'did:web:ian.self.xyz',
        didDoc({
          did: 'did:web:ian.self.xyz',
          controller: 'did:web:ian.self.xyz',
          publicKey: ian.publicKey,
          principalDid: 'did:web:ian.self.xyz',
        }),
      ],
      [
        'did:web:nick.self.xyz',
        didDoc({
          did: 'did:web:nick.self.xyz',
          controller: 'did:web:nick.self.xyz',
          publicKey: nick.publicKey,
          principalDid: 'did:web:nick.self.xyz',
        }),
      ],
      [
        'did:web:samantha.agent',
        didDoc({
          did: 'did:web:samantha.agent',
          controller: 'did:web:ian.self.xyz',
          publicKey: samantha.publicKey,
          principalDid: 'did:web:ian.self.xyz',
        }),
      ],
      [
        'did:web:ghost.agent',
        didDoc({
          did: 'did:web:ghost.agent',
          controller: 'did:web:nick.self.xyz',
          publicKey: ghost.publicKey,
          principalDid: 'did:web:nick.self.xyz',
        }),
      ],
    ]);

    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const proposal = await createPairingProposal({
      issuer: 'did:web:ian.self.xyz',
      subject: 'did:web:samantha.agent',
      audience: 'did:web:ghost.agent',
      purpose: 'project:alpha',
      scopeSelections: [
        { id: 'files.projects.list' },
        {
          id: 'files.project.files.read',
          params: { project_id: 'alpha', max_size_mb: 25 },
        },
      ],
      requiredVcs: ['self_xyz.verified_human'],
      expiresAt,
      scopeCatalogVersion: 'v1',
      catalog,
      issuerKey: ian.key,
    });

    expect(proposal.cedar_policies.length).toBeGreaterThan(0);
    expect(proposal.sigs['did:web:ian.self.xyz']).toBeDefined();

    const url = buildInvitationUrl(
      proposal,
      'https://samantha.agent/pair/accept',
    );
    expect(url).toContain('invitation=');
    expect(() => new URL(url)).not.toThrow();

    const parsed = parseInvitationUrl(url);
    expect(parsed).toEqual(proposal);

    // Single-sig proposal should not verify yet (audience missing).
    const preCounter = await verifyPairingProposal(parsed, { resolver });
    expect(preCounter.ok).toBe(false);

    const { token, proposal: signed } = await countersignProposal({
      proposal: parsed,
      counterpartyKey: nick.key,
      counterpartyDid: 'did:web:nick.self.xyz',
      catalog,
    });

    // Schema-valid
    expect(() => ConnectionTokenSchema.parse(token)).not.toThrow();
    expect(Object.keys(token.sigs).sort()).toEqual([
      'did:web:ian.self.xyz',
      'did:web:nick.self.xyz',
    ]);

    // Dual-signed proposal verifies
    const proposalVerdict = await verifyPairingProposal(signed, { resolver });
    expect(proposalVerdict).toEqual({ ok: true });

    // ConnectionToken verifies end-to-end
    const tokenVerdict = await verifyConnectionToken(token, { resolver });
    expect(tokenVerdict).toEqual({ ok: true });
  });

  it('tampering any field causes verification to fail', async () => {
    const catalog = loadScopesFromDirectory(SCOPES_DIR);

    const ian = await newKey('did:web:ian.self.xyz#key-1');
    const nick = await newKey('did:web:nick.self.xyz#key-1');
    const samantha = await newKey('did:web:samantha.agent#key-1');
    const ghost = await newKey('did:web:ghost.agent#key-1');

    const resolver = mapResolver([
      [
        'did:web:ian.self.xyz',
        didDoc({
          did: 'did:web:ian.self.xyz',
          controller: 'did:web:ian.self.xyz',
          publicKey: ian.publicKey,
          principalDid: 'did:web:ian.self.xyz',
        }),
      ],
      [
        'did:web:nick.self.xyz',
        didDoc({
          did: 'did:web:nick.self.xyz',
          controller: 'did:web:nick.self.xyz',
          publicKey: nick.publicKey,
          principalDid: 'did:web:nick.self.xyz',
        }),
      ],
      [
        'did:web:samantha.agent',
        didDoc({
          did: 'did:web:samantha.agent',
          controller: 'did:web:ian.self.xyz',
          publicKey: samantha.publicKey,
          principalDid: 'did:web:ian.self.xyz',
        }),
      ],
      [
        'did:web:ghost.agent',
        didDoc({
          did: 'did:web:ghost.agent',
          controller: 'did:web:nick.self.xyz',
          publicKey: ghost.publicKey,
          principalDid: 'did:web:nick.self.xyz',
        }),
      ],
    ]);

    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const proposal = await createPairingProposal({
      issuer: 'did:web:ian.self.xyz',
      subject: 'did:web:samantha.agent',
      audience: 'did:web:ghost.agent',
      purpose: 'project:alpha',
      scopeSelections: [{ id: 'files.projects.list' }],
      expiresAt,
      scopeCatalogVersion: 'v1',
      catalog,
      issuerKey: ian.key,
    });

    const { token } = await countersignProposal({
      proposal,
      counterpartyKey: nick.key,
      counterpartyDid: 'did:web:nick.self.xyz',
      catalog,
    });

    // Baseline: verifies
    expect(await verifyConnectionToken(token, { resolver })).toEqual({
      ok: true,
    });

    // Tamper with `purpose`
    const tamperedPurpose = { ...token, purpose: 'project:beta' };
    expect(
      (await verifyConnectionToken(tamperedPurpose, { resolver })).ok,
    ).toBe(false);

    // Tamper with cedar policy
    const tamperedPolicy = {
      ...token,
      cedar_policies: [
        ...token.cedar_policies.map((p, i) =>
          i === 0 ? p.replace('permit', 'forbid') : p,
        ),
      ],
    };
    expect(
      (await verifyConnectionToken(tamperedPolicy, { resolver })).ok,
    ).toBe(false);

    // Tamper with expiry
    const tamperedExpiry = { ...token, expires: '2099-01-01T00:00:00Z' };
    expect(
      (await verifyConnectionToken(tamperedExpiry, { resolver })).ok,
    ).toBe(false);

    // Tamper with audience
    const tamperedAudience = { ...token, audience: 'did:web:evil.agent' };
    expect(
      (await verifyConnectionToken(tamperedAudience, { resolver })).ok,
    ).toBe(false);

    // Tamper with issuer
    const tamperedIssuer = { ...token, issuer: 'did:web:evil.self.xyz' };
    expect(
      (await verifyConnectionToken(tamperedIssuer, { resolver })).ok,
    ).toBe(false);

    // Tamper with sigs: drop one
    const oneSig = { ...token, sigs: { [token.issuer]: token.sigs[token.issuer]! } };
    expect((await verifyConnectionToken(oneSig, { resolver })).ok).toBe(false);

    // Tamper with sigs: replace with garbage
    const garbageSigs = {
      ...token,
      sigs: Object.fromEntries(
        Object.entries(token.sigs).map(([k]) => [k, 'AAAA']),
      ),
    };
    expect(
      (await verifyConnectionToken(garbageSigs, { resolver })).ok,
    ).toBe(false);
  });

  it('countersign refuses when audience-side recompile diverges', async () => {
    const catalog = loadScopesFromDirectory(SCOPES_DIR);
    const ian = await newKey('did:web:ian.self.xyz#key-1');
    const nick = await newKey('did:web:nick.self.xyz#key-1');

    const proposal = await createPairingProposal({
      issuer: 'did:web:ian.self.xyz',
      subject: 'did:web:samantha.agent',
      audience: 'did:web:ghost.agent',
      purpose: 'project:alpha',
      scopeSelections: [{ id: 'files.projects.list' }],
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      scopeCatalogVersion: 'v1',
      catalog,
      issuerKey: ian.key,
    });

    // Pretend the issuer smuggled in a policy unrelated to the scope selection.
    const tampered: PairingProposal = {
      ...proposal,
      cedar_policies: [
        'permit (principal, action, resource);',
      ],
    };

    await expect(
      countersignProposal({
        proposal: tampered,
        counterpartyKey: nick.key,
        counterpartyDid: 'did:web:nick.self.xyz',
        catalog,
      }),
    ).rejects.toThrow(/cedar policy/i);
  });

  it('expired token fails verification', async () => {
    const catalog = loadScopesFromDirectory(SCOPES_DIR);
    const ian = await newKey('did:web:ian.self.xyz#key-1');
    const nick = await newKey('did:web:nick.self.xyz#key-1');

    const resolver = mapResolver([
      [
        'did:web:ian.self.xyz',
        didDoc({
          did: 'did:web:ian.self.xyz',
          controller: 'did:web:ian.self.xyz',
          publicKey: ian.publicKey,
          principalDid: 'did:web:ian.self.xyz',
        }),
      ],
      [
        'did:web:nick.self.xyz',
        didDoc({
          did: 'did:web:nick.self.xyz',
          controller: 'did:web:nick.self.xyz',
          publicKey: nick.publicKey,
          principalDid: 'did:web:nick.self.xyz',
        }),
      ],
      [
        'did:web:samantha.agent',
        didDoc({
          did: 'did:web:samantha.agent',
          controller: 'did:web:ian.self.xyz',
          publicKey: ian.publicKey,
          principalDid: 'did:web:ian.self.xyz',
        }),
      ],
      [
        'did:web:ghost.agent',
        didDoc({
          did: 'did:web:ghost.agent',
          controller: 'did:web:nick.self.xyz',
          publicKey: nick.publicKey,
          principalDid: 'did:web:nick.self.xyz',
        }),
      ],
    ]);

    const proposal = await createPairingProposal({
      issuer: 'did:web:ian.self.xyz',
      subject: 'did:web:samantha.agent',
      audience: 'did:web:ghost.agent',
      purpose: 'project:alpha',
      scopeSelections: [{ id: 'files.projects.list' }],
      expiresAt: '2000-01-01T00:00:00Z',
      scopeCatalogVersion: 'v1',
      catalog,
      issuerKey: ian.key,
    });

    const { token } = await countersignProposal({
      proposal,
      counterpartyKey: nick.key,
      counterpartyDid: 'did:web:nick.self.xyz',
      catalog,
    });

    const v = await verifyConnectionToken(token, { resolver });
    expect(v.ok).toBe(false);

    const vAllow = await verifyConnectionToken(token, {
      resolver,
      allowExpired: true,
    });
    expect(vAllow.ok).toBe(true);
  });
});
