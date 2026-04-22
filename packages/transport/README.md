# `@kybernesis/arp-transport`

DIDComm v2 signed messaging + SQLite-backed inbound mailbox.

## The transport isolation rule

This is the **only** ARP package permitted to depend on a DIDComm wire-format
library. The runtime, PDP, registry, audit, resolver, and TLS packages must
all talk to the `Transport` interface exported here — never directly to
`@veramo/did-comm` or any successor. That constraint keeps alt-transports
(A2A, cloud mailbox, future DIDComm implementations) a drop-in swap rather
than a cross-package rewrite.

## v0 envelope format

v0 ships the *signed* flavour of DIDComm v2 (JWM + JWS EdDSA). Each envelope
is a compact JWS:

```
<base64url(header)> . <base64url(payload)> . <base64url(signature)>
```

```jsonc
// header
{ "alg": "EdDSA", "typ": "application/didcomm-signed+json", "kid": "did:web:samantha.agent#key-1" }

// payload (DIDComm v2 plaintext JWM)
{
  "id": "msg-1234",
  "type": "https://didcomm.org/arp/1.0/request",
  "from": "did:web:samantha.agent",
  "to": ["did:web:ghost.agent"],
  "created_time": 1752000000,
  "body": { "action": "read", "resource": "alpha/q2" }
}
```

The JWE encryption layer lands alongside the cloud transport in Phase 7.
Until then, agent-to-agent confidentiality relies on the DID-pinned TLS
channel (see `@kybernesis/arp-tls`).

## Use

```ts
import {
  createTransport,
  createInMemoryKeyStore,
  createResolverAdapter,
} from '@kybernesis/arp-transport';
import { createResolver } from '@kybernesis/arp-resolver';

const transport = createTransport({
  did: 'did:web:samantha.agent',
  keyStore: createInMemoryKeyStore('did:web:samantha.agent', privateKeyRaw),
  resolver: createResolverAdapter(createResolver()),
  mailboxPath: '/var/lib/arp/mailbox.sqlite',
});

transport.listen(async (msg, meta) => {
  // ...evaluate PDP, dispatch, reply
});

// In the Hono POST /didcomm handler:
await transport.receiveEnvelope(await req.text());

// Sending:
await transport.send('did:web:ghost.agent', {
  id: crypto.randomUUID(),
  type: 'https://didcomm.org/arp/1.0/request',
  from: 'did:web:samantha.agent',
  to: ['did:web:ghost.agent'],
  body: { action: 'read', resource: 'alpha/q2' },
});
```

## Mailbox

Inbound envelopes are persisted to a SQLite table (`inbox`) keyed by
message id. The handler loop polls pending rows and marks them delivered
once the handler resolves. Duplicate `msg_id` posts are silently deduped.

## Design notes

- Signing + verification use `@noble/ed25519` directly. `jose` is a declared
  dep for future JWE support but isn't wired into the v0 signing path.
- Key material is raw 32-byte Ed25519. `createFileKeyStore(...)` handles
  persist-on-first-boot with `chmod 0600`.
- The resolver adapter pulls the primary ed25519 key from the DID doc's
  `verificationMethod[0].publicKeyMultibase`. Multi-key DID docs can supply
  a custom resolver that picks a specific key id via the JWS `kid` header.
