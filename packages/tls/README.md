# `@kybernesis/arp-tls`

Self-signed Ed25519 X.509 certificate generation plus DID-pinned fingerprint
validation for ARP agents.

## Why not Let's Encrypt?

Agent names live on Handshake (`.agent`). Web PKI can't see them. ARP v0 skips
CAs entirely — agents generate a long-lived self-signed cert, publish its
SHA-256 fingerprint in their DID document, and peers validate against that
pin. See `docs/ARP-hns-resolution.md §4`.

## Install

```bash
pnpm add @kybernesis/arp-tls
```

## Use

```ts
import {
  generateAgentCert,
  computeFingerprint,
  validatePinnedDer,
  toTlsServerOptions,
} from '@kybernesis/arp-tls';
import { createServer, connect } from 'node:tls';

const result = await generateAgentCert({ did: 'did:web:samantha.agent' });
if (!result.ok) throw new Error(result.error.message);
const { certPem, keyPem, fingerprint } = result.value;

// Server side
const server = createServer(toTlsServerOptions(result.value), (socket) => {
  socket.end('hello');
});

// Client side — pin against the fingerprint found in the peer's DID doc.
const socket = connect({
  host: 'samantha.agent',
  port: 443,
  rejectUnauthorized: false,
  servername: 'samantha.agent',
});
socket.on('secureConnect', () => {
  const peer = socket.getPeerX509Certificate()!;
  if (!validatePinnedDer(peer.raw, expectedFingerprintFromDidDoc)) {
    socket.destroy();
    throw new Error('pin mismatch');
  }
});
```

## API

| Function                                | Notes                                         |
| --------------------------------------- | --------------------------------------------- |
| `generateAgentCert(opts)`               | Ed25519 self-signed cert, 10-year validity.   |
| `computeFingerprint(pemOrDer)`          | SHA-256 of DER, lowercase hex.                |
| `validatePinnedCert(pem, expected)`     | Constant-time compare; accepts `sha256:` prefix. |
| `validatePinnedDer(der, expected)`      | Same as above for Node's `peer.raw`.          |
| `toTlsServerOptions(cert)`              | Drop into `tls.createServer`/`https.createServer`. |
| `toTlsClientOptions({host, port})`      | `rejectUnauthorized: false` baseline — you own the pin check. |

## Design notes

- The generator mints a fresh Ed25519 keypair rather than consuming the
  agent's DID signing key. In v0 the TLS key is independent; Phase 3+ can
  optionally reuse the DID key once Node's Web Crypto supports importing
  raw multibase keys directly.
- `@peculiar/x509` is the sole extra dependency; Node's built-in
  `X509Certificate` handles parsing.
- Fingerprint comparison is constant-time to keep timing side channels off
  the table.
