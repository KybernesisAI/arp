import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import {
  createInMemoryKeyStore,
  ed25519RawToMultibase,
  type TransportResolver,
} from '@kybernesis/arp-transport';
import { createRuntime, type Runtime } from '@kybernesis/arp-runtime';
import type { DidDocument, ConnectionToken } from '@kybernesis/arp-spec';
import type { Resolver } from '@kybernesis/arp-resolver';
import {
  buildInvitationUrl,
  countersignProposal,
  createPairingProposal,
  parseInvitationUrl,
  verifyConnectionToken,
  type DidResolver,
} from '@kybernesis/arp-pairing';
import { loadScopesFromDirectory } from '@kybernesis/arp-scope-catalog';
import { renderProposalConsent } from '@kybernesis/arp-consent-ui';

const SCHEMA = readFileSync(
  resolve(
    __dirname,
    '..',
    '..',
    'packages',
    'spec',
    'src',
    'cedar-schema.json',
  ),
  'utf8',
);

const SCOPES_DIR = resolve(
  __dirname,
  '..',
  '..',
  'packages',
  'scope-catalog',
  'scopes',
);

const tempDirs: string[] = [];
const runtimes: Runtime[] = [];

afterEach(async () => {
  while (runtimes.length) {
    const r = runtimes.pop();
    try {
      await r?.stop();
    } catch {
      /* ignore */
    }
  }
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

const STUB_RESOLVER: Resolver = {
  async resolveHns() {
    return { a: [], aaaa: [], txt: {} };
  },
  async resolveDidWeb() {
    return { ok: false, error: { code: 'unsupported_method', message: 'stub' } };
  },
  clearCache() {},
};

describe('phase 4 — end-to-end pairing demo', () => {
  it('pair → exchange → revoke → deny with revocation proof', async () => {
    const catalog = loadScopesFromDirectory(SCOPES_DIR);

    /* ------------------------------------------------------------------ *
     *  Principal identities + agent keys                                 *
     * ------------------------------------------------------------------ */
    const ian = await mintKey('did:web:ian.self.xyz#key-1');
    const nick = await mintKey('did:web:nick.self.xyz#key-1');
    const samantha = await mintKey('did:web:samantha.agent#key-1');
    const ghost = await mintKey('did:web:ghost.agent#key-1');

    const resolver = mapResolver({
      'did:web:ian.self.xyz': didDoc({
        did: 'did:web:ian.self.xyz',
        controller: 'did:web:ian.self.xyz',
        publicKey: ian.publicKey,
        principalDid: 'did:web:ian.self.xyz',
      }),
      'did:web:nick.self.xyz': didDoc({
        did: 'did:web:nick.self.xyz',
        controller: 'did:web:nick.self.xyz',
        publicKey: nick.publicKey,
        principalDid: 'did:web:nick.self.xyz',
      }),
      'did:web:samantha.agent': didDoc({
        did: 'did:web:samantha.agent',
        controller: 'did:web:ian.self.xyz',
        publicKey: samantha.publicKey,
        principalDid: 'did:web:ian.self.xyz',
      }),
      'did:web:ghost.agent': didDoc({
        did: 'did:web:ghost.agent',
        controller: 'did:web:nick.self.xyz',
        publicKey: ghost.publicKey,
        principalDid: 'did:web:nick.self.xyz',
      }),
    });

    /* ------------------------------------------------------------------ *
     *  Shared in-process transport layer                                 *
     * ------------------------------------------------------------------ */
    const sharedKeys: Record<string, Uint8Array> = {
      'did:web:samantha.agent': samantha.publicKey,
      'did:web:ghost.agent': ghost.publicKey,
    };
    const sharedEndpoints: Record<string, URL> = {};
    const sharedReceivers: Record<
      string,
      (body: string) => Promise<{ ok: boolean; error?: unknown }>
    > = {};

    const transportResolver: TransportResolver = {
      async resolveEd25519PublicKey(did) {
        const k = sharedKeys[did];
        if (!k) throw new Error(`no key for ${did}`);
        return k;
      },
      async resolveDidCommEndpoint(did) {
        const url = sharedEndpoints[did];
        if (!url) throw new Error(`no endpoint for ${did}`);
        return url;
      },
    };

    const transportFetch: typeof fetch = async (input, init) => {
      const urlStr =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const entry = Object.entries(sharedEndpoints).find(
        ([, u]) => u.toString() === urlStr,
      );
      if (!entry) return new Response('unknown endpoint', { status: 404 });
      const [did] = entry;
      const body = typeof init?.body === 'string' ? init.body : '';
      const r = await sharedReceivers[did]!(body);
      return new Response(
        r.ok ? JSON.stringify({ ok: true }) : JSON.stringify(r.error),
        { status: r.ok ? 200 : 400 },
      );
    };

    /* ------------------------------------------------------------------ *
     *  Two sidecars — Samantha (issuer) + Ghost (audience)                *
     * ------------------------------------------------------------------ */
    async function buildAgent(
      did: string,
      port: number,
      privateKey: Uint8Array,
    ): Promise<Runtime> {
      const dir = mkdtempSync(join(tmpdir(), `arp-phase4-${did.split(':')[2]}-`));
      tempDirs.push(dir);
      sharedEndpoints[did] = new URL(`http://127.0.0.1:${port}/didcomm`);

      const runtime = await createRuntime({
        config: {
          did,
          principalDid:
            did === 'did:web:samantha.agent'
              ? 'did:web:ian.self.xyz'
              : 'did:web:nick.self.xyz',
          publicKeyMultibase: ed25519RawToMultibase(sharedKeys[did]!),
          agentName: did.split(':')[2] ?? 'agent',
          agentDescription: `phase 4 pairing demo: ${did}`,
          wellKnownUrls: {
            didcomm: `http://127.0.0.1:${port}/didcomm`,
            agentCard: `http://127.0.0.1:${port}/.well-known/agent-card.json`,
            arpJson: `http://127.0.0.1:${port}/.well-known/arp.json`,
          },
          representationVcUrl: `http://127.0.0.1:${port}/.well-known/representation.jwt`,
          scopeCatalogVersion: 'v1',
          tlsFingerprint: 'a'.repeat(64),
        },
        keyStore: createInMemoryKeyStore(did, privateKey),
        resolver: STUB_RESOLVER,
        transportResolver,
        transportFetch,
        cedarSchemaJson: SCHEMA,
        registryPath: join(dir, 'registry.sqlite'),
        auditDir: join(dir, 'audit'),
        mailboxPath: join(dir, 'mailbox.sqlite'),
        adminToken: 'phase4-admin',
        dispatch: async ({ message, connectionId }) => {
          const body = message.body as Record<string, unknown>;
          return {
            reply: {
              echo: body,
              connection_id: connectionId,
              summary: `Summary of ${String(body['resource'])}`,
            },
          };
        },
      });
      runtimes.push(runtime);
      await runtime.start(port);
      sharedReceivers[did] = runtime.transport.receiveEnvelope.bind(
        runtime.transport,
      );
      return runtime;
    }

    const samanthaRuntime = await buildAgent(
      'did:web:samantha.agent',
      4501,
      samantha.privateKey,
    );
    const ghostRuntime = await buildAgent(
      'did:web:ghost.agent',
      4502,
      ghost.privateKey,
    );

    async function fullyDrain() {
      let quiescent = 0;
      while (quiescent < 2) {
        const s = await samanthaRuntime.transport.drainInbox();
        const g = await ghostRuntime.transport.drainInbox();
        if (s === 0 && g === 0) quiescent++;
        else quiescent = 0;
      }
    }

    /* ------------------------------------------------------------------ *
     *  Pairing: Samantha's owner (Ian) issues invitation                 *
     * ------------------------------------------------------------------ */
    const proposal = await createPairingProposal({
      issuer: 'did:web:ian.self.xyz',
      subject: 'did:web:samantha.agent',
      audience: 'did:web:ghost.agent',
      purpose: 'Project Alpha',
      scopeSelections: [
        { id: 'files.projects.list' },
        {
          id: 'files.project.files.read',
          params: { project_id: 'alpha', max_size_mb: 25 },
        },
        {
          id: 'files.project.files.summarize',
          params: { project_id: 'alpha', max_output_words: 1000 },
        },
      ],
      requiredVcs: ['self_xyz.verified_human'],
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      scopeCatalogVersion: 'v1',
      catalog,
      issuerKey: {
        privateKey: ian.privateKey,
        kid: 'did:web:ian.self.xyz#key-1',
      },
    });

    const invitationUrl = buildInvitationUrl(
      proposal,
      'https://ian.samantha.agent/pair/accept',
    );

    /* ------------------------------------------------------------------ *
     *  Ghost's owner (Nick) parses, reviews consent, countersigns        *
     * ------------------------------------------------------------------ */
    const parsed = parseInvitationUrl(invitationUrl);
    const consent = renderProposalConsent(parsed, catalog);
    expect(consent.willBeAbleTo.length).toBeGreaterThan(0);
    expect(consent.risk).toBe('medium');

    const { token, proposal: signedProposal } = await countersignProposal({
      proposal: parsed,
      counterpartyKey: {
        privateKey: nick.privateKey,
        kid: 'did:web:nick.self.xyz#key-1',
      },
      counterpartyDid: 'did:web:nick.self.xyz',
      catalog,
    });

    // Dual-sig'd token verifies against the DID docs.
    expect(await verifyConnectionToken(token, { resolver })).toEqual({
      ok: true,
    });
    expect(Object.keys(signedProposal.sigs).sort()).toEqual([
      'did:web:ian.self.xyz',
      'did:web:nick.self.xyz',
    ]);

    /* ------------------------------------------------------------------ *
     *  Persist on both sides via the admin API                            *
     * ------------------------------------------------------------------ */
    const ghostToken: ConnectionToken = {
      ...token,
      subject: 'did:web:ghost.agent',
      audience: 'did:web:samantha.agent',
    };

    await postConnection(4501, token);
    await postConnection(4502, ghostToken);

    // Seeing the connection listed via /admin/connections.
    const listed = (await adminGet(4501, '/admin/connections')) as {
      connections: Array<{ connection_id: string }>;
    };
    expect(listed.connections.some((c) => c.connection_id === token.connection_id)).toBe(true);

    /* ------------------------------------------------------------------ *
     *  Scoped request round-trip (Ghost → Samantha, allow)               *
     * ------------------------------------------------------------------ */
    await ghostRuntime.transport.send('did:web:samantha.agent', {
      id: 'msg-allow-1',
      type: 'https://didcomm.org/arp/1.0/request',
      from: 'did:web:ghost.agent',
      to: ['did:web:samantha.agent'],
      body: {
        connection_id: token.connection_id,
        action: 'summarize',
        resource: 'Project:alpha',
      },
    });
    await fullyDrain();

    const auditAfterAllow = samanthaRuntime.auditFor(token.connection_id).verify();
    expect(auditAfterAllow.valid).toBe(true);
    expect(auditAfterAllow.entriesSeen).toBe(1);

    /* ------------------------------------------------------------------ *
     *  Samantha's owner revokes the connection                            *
     * ------------------------------------------------------------------ */
    await adminPost(4501, `/admin/connections/${token.connection_id}/revoke`, {
      reason: 'user_requested',
    });

    /* ------------------------------------------------------------------ *
     *  Ghost's next message gets denied with a revocation reason         *
     * ------------------------------------------------------------------ */
    await ghostRuntime.transport.send('did:web:samantha.agent', {
      id: 'msg-after-revoke',
      type: 'https://didcomm.org/arp/1.0/request',
      from: 'did:web:ghost.agent',
      to: ['did:web:samantha.agent'],
      body: {
        connection_id: token.connection_id,
        action: 'summarize',
        resource: 'Project:alpha',
      },
    });
    await fullyDrain();

    const auditAfterRevoke = readFileSync(
      samanthaRuntime.auditFor(token.connection_id).path,
      'utf8',
    )
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) =>
        JSON.parse(l) as { decision: string; msg_id: string; reason: string | null },
      );
    expect(auditAfterRevoke).toHaveLength(2);
    expect(auditAfterRevoke[0]?.decision).toBe('allow');
    expect(auditAfterRevoke[1]?.decision).toBe('deny');
    expect(auditAfterRevoke[1]?.reason).toMatch(/revoked/);

    // Revocation is also visible on /.well-known/revocations.json.
    const rev = (await (
      await fetch('http://127.0.0.1:4501/.well-known/revocations.json')
    ).json()) as { revocations: Array<{ type: string; id: string }> };
    expect(
      rev.revocations.some(
        (r) => r.type === 'connection' && r.id === token.connection_id,
      ),
    ).toBe(true);
  });
});

/* ---- helpers ---- */

async function mintKey(kid: string): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  kid: string;
}> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  return { privateKey, publicKey, kid };
}

function didDoc(params: {
  did: string;
  controller: string;
  publicKey: Uint8Array;
  principalDid: string;
}): DidDocument {
  const keyId = `${params.did}#key-1`;
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

function mapResolver(entries: Record<string, DidDocument>): DidResolver {
  return {
    async resolve(did) {
      const doc = entries[did];
      if (!doc) return { ok: false, reason: `unknown DID ${did}` };
      return { ok: true, value: doc };
    },
  };
}

async function adminGet(port: number, path: string): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { authorization: 'Bearer phase4-admin' },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function adminPost(
  port: number,
  path: string,
  body: unknown,
): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer phase4-admin',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function postConnection(port: number, token: ConnectionToken): Promise<void> {
  await adminPost(port, '/admin/connections', { token });
}
