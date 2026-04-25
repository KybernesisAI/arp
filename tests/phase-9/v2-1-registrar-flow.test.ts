/**
 * Phase 9 slice 9b — end-to-end v2.1 TLD registrar flow.
 *
 * Simulates a Headless-style registrar walking through the Option A UX:
 *
 *   1. Registrar redirects user to GET /onboard?domain=<sld>&registrar=X&callback=Y
 *   2. User's browser generates a did:key, creates a tenant via POST /api/tenants
 *   3. Browser signs a representation JWT whose iss is the cloud-managed
 *      did:web alias (did:web:cloud.arp.run:u:<tenantId>)
 *   4. Browser redirects back to the registrar's callback with principal_did
 *      + signed_representation_jwt
 *   5. Registrar POSTs /internal/registrar/bind (PSK-gated) with the payload
 *   6. A third party fetches GET /u/<tenantId>/did.json to verify the JWT
 *
 * We drive every route handler directly against a single PGlite instance.
 * The shared `@/lib/db` mock wires every route to the same db. Passing this
 * test means the three endpoints cooperate exactly as the v2.1 spec describes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import {
  createPgliteDb,
  registrarBindings,
  tenants,
  onboardingSessions,
} from '@kybernesis/arp-cloud-db';
import type { CloudDbClient } from '@kybernesis/arp-cloud-db';
import {
  ed25519RawToMultibase,
  multibaseEd25519ToRaw,
} from '@kybernesis/arp-transport';
import { eq } from 'drizzle-orm';

const PSK = 'phase-9b-integration-psk-abcdef123456';
process.env['ARP_CLOUD_REGISTRAR_PSK'] = PSK;
process.env['ARP_CLOUD_SESSION_SECRET'] =
  process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'phase-9b-session-secret-abcdef';

let currentDb: { db: CloudDbClient; close: () => Promise<void> } | null = null;
const cookieStore = new Map<string, string>();

vi.mock('@/lib/db', async () => ({
  getDb: async () => {
    if (!currentDb) throw new Error('test db not initialised');
    return currentDb.db;
  },
  resetDbForTests: async () => {
    if (currentDb) {
      await currentDb.close();
      currentDb = null;
    }
  },
}));

// Slice 9c rate-limiting on /onboard calls `headers()` before anything
// else, so we must mock both `cookies` and `headers`. Using a per-test IP
// counter keeps rate-limit buckets isolated across test runs.
let headersForTest: Map<string, string> = new Map([['x-forwarded-for', '203.0.113.1']]);

vi.mock('next/headers', async () => ({
  cookies: async () => ({
    get: (name: string) => {
      const v = cookieStore.get(name);
      return v ? { name, value: v } : undefined;
    },
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
  headers: async () => {
    const h = new Headers();
    for (const [k, v] of headersForTest) h.set(k, v);
    return h;
  },
}));

// Import after mocks.
const OnboardPage = (await import('@/app/onboard/page')).default;
const { POST: TenantsPost } = await import('@/app/api/tenants/route');
const { POST: RegistrarBindPost } = await import(
  '@/app/internal/registrar/bind/route'
);
const { GET: UserDidGet } = await import('@/app/u/[uuid]/did.json/route');

function base64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function base64urlEncodeString(s: string): string {
  return base64urlEncode(new TextEncoder().encode(s));
}

function base64urlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64url'));
}

async function signRepresentationJwt(
  issuerDid: string,
  agentDid: string,
  privateKey: Uint8Array,
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'EdDSA',
    typ: 'JWT',
    kid: `${issuerDid}#key-1`,
  };
  const payload = {
    iss: issuerDid,
    sub: agentDid,
    iat,
    exp: iat + 365 * 24 * 60 * 60,
    vc: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'AgentRepresentation'],
      credentialSubject: {
        id: agentDid,
        representedBy: issuerDid,
        scope: 'full',
        constraints: {
          maxConcurrentConnections: 10,
          allowedTransferOfOwnership: false,
        },
      },
    },
  };
  const headerB64 = base64urlEncodeString(JSON.stringify(header));
  const payloadB64 = base64urlEncodeString(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await ed25519.signAsync(
    new TextEncoder().encode(signingInput),
    privateKey,
  );
  return `${signingInput}.${base64urlEncode(sig)}`;
}

async function verifyRepresentationJwtAgainstDidDoc(
  jwt: string,
  publicKey: Uint8Array,
): Promise<boolean> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = base64urlDecode(sigB64);
  return ed25519.verifyAsync(
    sig,
    new TextEncoder().encode(signingInput),
    publicKey,
  );
}

describe('Phase 9b — v2.1 registrar flow (integration)', () => {
  beforeEach(async () => {
    const built = await createPgliteDb();
    currentDb = { db: built.db as unknown as CloudDbClient, close: built.close };
    cookieStore.clear();
    // Unique IP per test keeps rate-limit buckets isolated across a
    // single-file run. PGlite is ephemeral per test via beforeEach, so
    // resetting here is belt-and-braces only.
    headersForTest = new Map([
      ['x-forwarded-for', `203.0.113.${Math.floor(Math.random() * 254) + 1}`],
    ]);
  });
  afterEach(async () => {
    if (currentDb) {
      await currentDb.close();
      currentDb = null;
    }
  });

  it('round-trips /onboard → /api/tenants → JWT sign → /internal/registrar/bind → /u/<uuid>/did.json', async () => {
    const domain = 'samantha.agent';
    const registrar = 'headless';
    const callback = 'https://headless.example/callback';

    // Step 1: Registrar redirects user's browser to /onboard.
    // The server component creates an onboarding_sessions row as a side effect.
    await OnboardPage({
      searchParams: Promise.resolve({ domain, registrar, callback }),
    });
    if (!currentDb) throw new Error('db gone');
    const sessionRows = await currentDb.db.select().from(onboardingSessions);
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0]?.domain).toBe(domain);
    expect(sessionRows[0]?.registrar).toBe(registrar);

    // Step 2: User's browser generates a did:key.
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = await ed25519.getPublicKeyAsync(privateKey);
    const publicKeyMultibase = ed25519RawToMultibase(publicKey);
    const principalDidKey = `did:key:${publicKeyMultibase}`;

    // Step 3: Browser POSTs /api/tenants. (We clear the cookie store between
    // checks — tenant creation issues a session cookie but we don't need it.)
    const tenantRes = await TenantsPost(
      new Request('http://test.local/api/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          principalDid: principalDidKey,
          publicKeyMultibase,
          recoveryPhraseConfirmed: true,
        }),
      }),
    );
    expect(tenantRes.status).toBe(200);
    const tenantBody = (await tenantRes.json()) as { tenantId: string };
    const tenantId = tenantBody.tenantId;

    // Step 4: Browser signs a representation JWT whose iss is the cloud-
    // managed did:web alias.
    const cloudIssuer = `did:web:cloud.arp.run:u:${tenantId}`;
    const agentDid = `did:web:${domain}`;
    const representationJwt = await signRepresentationJwt(
      cloudIssuer,
      agentDid,
      privateKey,
    );

    // Step 5: Registrar (mocked) posts to /internal/registrar/bind using the
    // returned principal_did + JWT.
    const bindRes = await RegistrarBindPost(
      new Request('http://test.local/internal/registrar/bind', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${PSK}`,
        },
        body: JSON.stringify({
          domain,
          owner_label: 'ian',
          principal_did: cloudIssuer,
          public_key_multibase: publicKeyMultibase,
          representation_jwt: representationJwt,
          registrar,
        }),
      }),
    );
    expect(bindRes.status).toBe(200);
    const bindBody = (await bindRes.json()) as { ok: boolean; tenant_id: string | null };
    expect(bindBody.ok).toBe(true);
    // tenant_id is null here because the registrar's principal_did is the
    // cloud alias, which is NOT what's stored in tenants.principal_did
    // (that's the raw did:key). The alias → tenantId linkage is the
    // responsibility of a future reconciliation job.
    expect(bindBody.tenant_id).toBeNull();

    const bindingRows = await currentDb.db
      .select()
      .from(registrarBindings)
      .where(eq(registrarBindings.domain, domain));
    expect(bindingRows).toHaveLength(1);
    expect(bindingRows[0]?.ownerLabel).toBe('ian');
    expect(bindingRows[0]?.principalDid).toBe(cloudIssuer);
    expect(bindingRows[0]?.representationJwt).toBe(representationJwt);

    // Step 6: A third party fetches /u/<uuid>/did.json to verify the JWT's
    // signature. The pubkey in the DID doc must be the one we signed with.
    const didDocRes = await UserDidGet(
      new Request(`http://test.local/u/${tenantId}/did.json`),
      { params: Promise.resolve({ uuid: tenantId }) },
    );
    expect(didDocRes.status).toBe(200);
    expect(didDocRes.headers.get('content-type')).toBe('application/did+json');
    const didDoc = (await didDocRes.json()) as {
      id: string;
      verificationMethod: Array<{ publicKeyMultibase: string }>;
    };
    expect(didDoc.id).toBe(cloudIssuer);
    const publishedPubkey = multibaseEd25519ToRaw(
      didDoc.verificationMethod[0]!.publicKeyMultibase,
    );
    expect(Array.from(publishedPubkey)).toEqual(Array.from(publicKey));

    const jwtValid = await verifyRepresentationJwtAgainstDidDoc(
      representationJwt,
      publishedPubkey,
    );
    expect(jwtValid).toBe(true);

    // Round-trip assertion: a tampered JWT should NOT verify. We replace
    // the 64-byte signature with 64 zero bytes so the shape is still valid
    // but the signature cannot possibly match the signing input.
    const zeroSig = base64urlEncode(new Uint8Array(64));
    const tamperedJwt = representationJwt.replace(/\.[^.]+$/, `.${zeroSig}`);
    const tamperedValid = await verifyRepresentationJwtAgainstDidDoc(
      tamperedJwt,
      publishedPubkey,
    );
    expect(tamperedValid).toBe(false);
  });

  it('tenants lookup by principal_did finds the tenant when registrar supplies the did:key form', async () => {
    // This alternate flow matches a registrar that preserves the user's
    // did:key in the callback instead of converting to the did:web alias.
    // It's out of v2.1's Option-A canonical shape but the endpoint still
    // supports it (the opener hard rules say the body shape is fixed, but
    // the linkage is principal_did-agnostic).
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = await ed25519.getPublicKeyAsync(privateKey);
    const publicKeyMultibase = ed25519RawToMultibase(publicKey);
    const principalDidKey = `did:key:${publicKeyMultibase}`;

    const tenantRes = await TenantsPost(
      new Request('http://test.local/api/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          principalDid: principalDidKey,
          publicKeyMultibase,
          recoveryPhraseConfirmed: true,
        }),
      }),
    );
    expect(tenantRes.status).toBe(200);
    const tenantBody = (await tenantRes.json()) as { tenantId: string };

    const bindRes = await RegistrarBindPost(
      new Request('http://test.local/internal/registrar/bind', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${PSK}`,
        },
        body: JSON.stringify({
          domain: 'ghost.agent',
          owner_label: 'ian',
          principal_did: principalDidKey,
          public_key_multibase: publicKeyMultibase,
          representation_jwt: 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJkaWQ6a2V5In0.c2ln',
        }),
      }),
    );
    expect(bindRes.status).toBe(200);
    const bindBody = (await bindRes.json()) as { tenant_id: string | null };
    expect(bindBody.tenant_id).toBe(tenantBody.tenantId);

    if (!currentDb) throw new Error('db gone');
    const bindings = await currentDb.db
      .select()
      .from(registrarBindings)
      .where(eq(registrarBindings.domain, 'ghost.agent'));
    expect(bindings[0]?.tenantId).toBe(tenantBody.tenantId);
    // The tenant row is intact.
    const tenantRows = await currentDb.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantBody.tenantId));
    expect(tenantRows).toHaveLength(1);
  });
});
