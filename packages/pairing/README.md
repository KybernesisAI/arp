# @kybernesis/arp-pairing

Pairing protocol implementation — creates, verifies, and countersigns Connection Tokens.

## Flow

1. **Issuer side.** `createPairingProposal` compiles the chosen scope bundle
   into Cedar policies, then signs the canonical bytes with the issuer's
   principal key. Output: a `PairingProposal`.
2. **Delivery.** `buildInvitationUrl` base64url-encodes the proposal JSON into
   a QR code or deep link (`https://samantha.agent/pair?invitation=…`).
3. **Audience side.** `parseInvitationUrl` decodes it. After rendering the
   consent UI, `countersignProposal` verifies the audience's local recompile
   still matches the issuer's policies, signs, and projects out a
   `ConnectionToken` ready for the runtime.
4. **Either side.** `verifyConnectionToken` (or `verifyPairingProposal`)
   takes a `DidResolver` and re-validates both signatures + expiry.

## Canonicalization

All signatures are computed over the JCS (RFC 8785) serialization of the nine
connection-payload fields: `connection_id`, `issuer`, `subject`, `audience`,
`purpose`, `cedar_policies`, `obligations`, `scope_catalog_version`,
`expires`. `sigs` itself is never included in the hashed bytes. The same
payload shape is used whether you start from a proposal or a token, so a
proposal's signatures carry verbatim into its `ConnectionToken`.
