/**
 * Browser-side representation JWT signer.
 *
 * Produces a signed JWS compact-serialisation of the `RepresentationVcSchema`
 * payload (`@kybernesis/arp-spec/src/schemas/representation-vc.ts`) using a
 * browser-held did:key principal. The JWT's `iss` is the cloud-managed
 * did:web alias (`did:web:cloud.arp.run:u:<uuid>`), whose DID document is served
 * at `GET /u/<uuid>/did.json` and carries the same public key, so downstream
 * verifiers can round-trip `iss` → DID doc → `publicKeyMultibase` → verify.
 *
 * Signing happens in the browser because Phase-8.5's `did:key` principal lives
 * in `localStorage`; the cloud never sees the private key. Slice 9c moves to
 * passkey-backed WebAuthn credentials.
 *
 * Schema contract: kid on the JWS header binds to `<iss>#key-1`; this is the
 * convention `GET /u/<uuid>/did.json` publishes verification methods under.
 */

import type { PrincipalKey } from './principal-key-browser';

const REPRESENTATION_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year
const DEFAULT_MAX_CONCURRENT_CONNECTIONS = 10;

export interface SignRepresentationJwtBrowserOptions {
  principal: PrincipalKey;
  /** Typically `did:web:cloud.arp.run:u:<tenantId>` for the Option-A cloud flow. */
  issuerDid: string;
  /** Agent DID being represented, e.g. `did:web:samantha.agent`. */
  agentDid: string;
  /** Override issued-at (ms). Only useful for tests. */
  nowMs?: number;
}

export async function signRepresentationJwtBrowser(
  opts: SignRepresentationJwtBrowserOptions,
): Promise<string> {
  const iat = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const exp = iat + REPRESENTATION_TTL_SECONDS;

  const header = {
    alg: 'EdDSA',
    typ: 'JWT',
    kid: `${opts.issuerDid}#key-1`,
  };
  const payload = {
    iss: opts.issuerDid,
    sub: opts.agentDid,
    iat,
    exp,
    vc: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'AgentRepresentation'],
      credentialSubject: {
        id: opts.agentDid,
        representedBy: opts.issuerDid,
        scope: 'full' as const,
        constraints: {
          maxConcurrentConnections: DEFAULT_MAX_CONCURRENT_CONNECTIONS,
          allowedTransferOfOwnership: false,
        },
      },
    },
  };

  const headerB64 = base64urlEncodeString(JSON.stringify(header));
  const payloadB64 = base64urlEncodeString(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = await opts.principal.sign(new TextEncoder().encode(signingInput));
  const signatureB64 = base64urlEncodeBytes(signature);
  return `${signingInput}.${signatureB64}`;
}

function base64urlEncodeString(s: string): string {
  return base64urlEncodeBytes(new TextEncoder().encode(s));
}

function base64urlEncodeBytes(bytes: Uint8Array): string {
  // btoa works on binary strings; convert Uint8Array byte-by-byte.
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(binary, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

