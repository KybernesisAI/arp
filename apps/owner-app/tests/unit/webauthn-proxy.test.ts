import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 10/10d: route-handler tests for the owner-app's WebAuthn proxy
 * routes. The owner-app sits between the user's browser and the sidecar
 * runtime; here we mock both `next/headers` (session cookie) and the
 * runtime fetch boundary so we can exercise the route logic without
 * starting a sidecar.
 */

const SESSION_COOKIE = 'arp_session';

interface MockCookie {
  value: string;
}

function setEnv(): void {
  process.env.ARP_RUNTIME_URL = 'http://127.0.0.1:9999';
  process.env.ARP_ADMIN_TOKEN = 's3cret';
  process.env.ARP_PRINCIPAL_DID = 'did:key:zMockOwner';
  process.env.ARP_AGENT_DID = 'did:web:mock.agent';
  process.env.ARP_OWNER_APP_BASE_URL = 'http://localhost:7878';
  process.env.ARP_SCOPE_CATALOG_VERSION = 'v1';
  process.env.ARP_SESSION_SECRET = 'test-session-secret-aaaaaaaaaaaaaaaaaaaa';
}

function installCookieMock(value: string | null): void {
  vi.doMock('next/headers', () => ({
    cookies: async () => ({
      get: (name: string): MockCookie | undefined =>
        name === SESSION_COOKIE && value !== null ? { value } : undefined,
      set: () => {
        /* noop */
      },
      delete: () => {
        /* noop */
      },
    }),
  }));
}

async function mintSessionCookie(): Promise<string> {
  // Build the same shape `setSession` would produce: <base64url(json)>.<hmac>
  const { createHmac } = await import('node:crypto');
  const payload = {
    principalDid: 'did:key:zMockOwner',
    nonce: 'unit-test-nonce',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', process.env.ARP_SESSION_SECRET!)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.resetModules();
  setEnv();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.doUnmock('next/headers');
});

describe('POST /api/auth/webauthn/register/options', () => {
  it('returns 401 without a session cookie', async () => {
    installCookieMock(null);
    const { POST } = await import('../../app/api/auth/webauthn/register/options/route');
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('proxies to the sidecar with the bearer token when session is present', async () => {
    installCookieMock(await mintSessionCookie());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ challenge: 'abc', rp: { id: 'localhost' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { POST } = await import('../../app/api/auth/webauthn/register/options/route');
    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { challenge: string };
    expect(body.challenge).toBe('abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toContain('/admin/webauthn/register/options');
    const headers = new Headers((calledInit as RequestInit | undefined)?.headers ?? {});
    expect(headers.get('authorization')).toBe('Bearer s3cret');
  });
});

describe('POST /api/auth/webauthn/auth/verify', () => {
  it('mints a session cookie when the sidecar verifies the assertion', async () => {
    installCookieMock(null);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'cred-row-id',
          credentialId: 'cred-external-id',
          principalDid: 'did:key:zMockOwner',
          agentDid: 'did:web:mock.agent',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const { POST } = await import('../../app/api/auth/webauthn/auth/verify/route');
    const req = new Request('http://localhost/api/auth/webauthn/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        response: {
          id: 'cred-external-id',
          response: { clientDataJSON: 'irrelevant' },
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; principalDid: string };
    expect(body.ok).toBe(true);
    expect(body.principalDid).toBe('did:key:zMockOwner');
  });

  it('returns 400 on missing response body', async () => {
    installCookieMock(null);
    const { POST } = await import('../../app/api/auth/webauthn/auth/verify/route');
    const req = new Request('http://localhost/api/auth/webauthn/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/keys/rotate-v2', () => {
  it('returns 401 without a session cookie', async () => {
    installCookieMock(null);
    const { POST } = await import('../../app/api/keys/rotate-v2/route');
    const req = new Request('http://localhost/api/keys/rotate-v2', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        new_principal_did: 'did:key:zNew',
        new_public_key_multibase: 'zNew',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('proxies the rotation payload to the sidecar', async () => {
    installCookieMock(await mintSessionCookie());
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          principal_did: 'did:key:zNew',
          previous_principal_did: 'did:key:zOld',
          previous_deprecated_at: '2026-07-25T00:00:00.000Z',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const { POST } = await import('../../app/api/keys/rotate-v2/route');
    const req = new Request('http://localhost/api/keys/rotate-v2', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        new_principal_did: 'did:key:zNew',
        new_public_key_multibase: 'zNew',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      principal_did: string;
      previous_principal_did: string;
    };
    expect(body.ok).toBe(true);
    expect(body.principal_did).toBe('did:key:zNew');
    expect(body.previous_principal_did).toBe('did:key:zOld');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toContain('/admin/identity/rotate');
  });

  it('rejects malformed bodies with 400', async () => {
    installCookieMock(await mintSessionCookie());
    const { POST } = await import('../../app/api/keys/rotate-v2/route');
    const req = new Request('http://localhost/api/keys/rotate-v2', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
