#!/usr/bin/env node
/**
 * arp-send — one-off DIDComm sender. Zero external deps; uses Node's
 * built-in crypto for ed25519 + base58btc/base64url inlined.
 *
 * Reads a handoff JSON, signs a DIDComm envelope as the agent in that
 * handoff, POSTs it to the cloud-gateway addressed to whichever DID
 * you specify (defaults to the handoff's own agent_did — the
 * self-message demo: bridge running → send envelope → bridge receives
 * → kyberbot replies → outbound envelope back through the gateway).
 *
 * Usage:
 *   node /Users/ianborders/arp/scripts/arp-send.mjs \
 *     --handoff ~/atlas/arp-handoff.json \
 *     --to did:web:atlas.agent \
 *     --text "Hello Atlas, what time is it in Bangkok?"
 *
 *   # short form (defaults --to to the handoff's own agent_did):
 *   node /Users/ianborders/arp/scripts/arp-send.mjs \
 *     --handoff ~/atlas/arp-handoff.json \
 *     --text "Test message"
 */

import { readFileSync } from 'node:fs';
import { randomUUID, createPrivateKey, sign as cryptoSign } from 'node:crypto';

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--handoff') flags.handoff = next();
    else if (a === '--to') flags.to = next();
    else if (a === '--text') flags.text = next();
    else if (a === '--gateway') flags.gateway = next();
    else if (a === '--connection-id') flags.connectionId = next();
    else if (a === '-h' || a === '--help') flags.help = true;
    else {
      console.error(`unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return flags;
}

const HELP = `arp-send — one-off DIDComm sender

  --handoff <path>     handoff JSON (required) — provides sender DID + private key
  --to <did>           recipient DID (default: handoff's own agent_did)
  --text <message>     plaintext body (required)
  --connection-id <id> existing connection id (required for any non-self-test message)
  --gateway <url>      gateway base URL (default: derived from handoff's gateway_ws_url)
  -h, --help           this help
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.handoff || !args.text) {
  process.stdout.write(HELP);
  process.exit(args.help ? 0 : 2);
}

// ---------- Inlined helpers (matches @kybernesis/arp-transport) ------------

function base64urlEncode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_DECODE = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) BASE58_DECODE[BASE58_ALPHABET[i]] = i;

function base58btcDecode(s) {
  if (s.length === 0) return new Uint8Array();
  const bytes = [0];
  for (const c of s) {
    const digit = BASE58_DECODE[c];
    if (digit === undefined) throw new Error(`invalid base58btc char: ${c}`);
    let carry = digit;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (let k = 0; k < s.length && s[k] === '1'; k++) leadingZeros++;
  const out = new Uint8Array(leadingZeros + bytes.length);
  for (let q = 0; q < bytes.length; q++) {
    out[leadingZeros + (bytes.length - 1 - q)] = bytes[q];
  }
  return out;
}

function multibaseEd25519ToRaw(multibase) {
  if (!multibase.startsWith('z')) throw new Error('expected multibase z-base58btc prefix');
  const decoded = base58btcDecode(multibase.slice(1));
  if (decoded.length === 34 && decoded[0] === 0xed && decoded[1] === 0x01) return decoded.slice(2);
  if (decoded.length === 32) return decoded;
  throw new Error(`unexpected ed25519 multibase length ${decoded.length}; expected 32 or 34 bytes`);
}

/**
 * Wrap a raw 32-byte ed25519 private key into Node's KeyObject by
 * synthesising a PKCS#8 DER blob. Required because Node's crypto.sign
 * only takes KeyObjects, not raw bytes. The 16-byte prefix is the
 * fixed PKCS#8 header for Ed25519 (RFC 8410): SEQ, len=46, version=0,
 * algId(SEQ), oid(1.3.101.112), OCTET STRING tag, len=32. After that
 * the 32 raw key bytes.
 */
function rawEd25519ToKeyObject(raw32) {
  const prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  const der = Buffer.concat([prefix, Buffer.from(raw32)]);
  return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

async function signEnvelope({ message, signerDid, privateKey }) {
  const header = {
    alg: 'EdDSA',
    typ: 'application/didcomm-signed+json',
    kid: `${signerDid}#key-1`,
  };
  const msg = {
    ...message,
    from: signerDid,
    created_time: message.created_time ?? Math.floor(Date.now() / 1000),
  };
  const enc = new TextEncoder();
  const headerB64 = base64urlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(enc.encode(JSON.stringify(msg)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const keyObj = rawEd25519ToKeyObject(privateKey);
  const sig = cryptoSign(null, Buffer.from(signingInput), keyObj);
  return `${signingInput}.${base64urlEncode(sig)}`;
}

// ---------- Main -------------------------------------------------------------

const bundle = JSON.parse(readFileSync(args.handoff, 'utf-8'));
const senderDid = bundle.agent_did;
const privateKey = multibaseEd25519ToRaw(bundle.agent_private_key_multibase);
const recipientDid = args.to ?? senderDid;
const recipientHost = recipientDid.replace(/^did:web:/, '');

const wsUrl = args.gateway ?? bundle.gateway_ws_url;
const gatewayHttp = wsUrl
  .replace(/^wss:/, 'https:')
  .replace(/^ws:/, 'http:')
  .replace(/\/ws$/, '');

const msgId = randomUUID();
const body = { text: args.text };
if (args.connectionId) body.connection_id = args.connectionId;
const compact = await signEnvelope({
  message: {
    id: msgId,
    type: 'https://didcomm.org/arp/1.0/request',
    from: senderDid,
    to: [recipientDid],
    body,
  },
  signerDid: senderDid,
  privateKey,
});

const url = `${gatewayHttp}/didcomm?target=${encodeURIComponent(recipientHost)}`;
console.log(`→ POST ${url}`);
console.log(`  from: ${senderDid}`);
console.log(`  to:   ${recipientDid}`);
console.log(`  text: ${args.text}`);
console.log(`  id:   ${msgId}`);

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/didcomm-signed+json' },
  body: compact,
});
const body = await res.text();
console.log(`\n← ${res.status}`);
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body);
}

if (!res.ok) process.exit(1);
console.log(
  `\nNow watch the bridge terminal — you should see:\n` +
    `  [bridge] ← ${senderDid}: ${args.text}\n` +
    `  [bridge] → ${senderDid}: <Atlas's reply>\n` +
    `\nKyberBot's terminal will show chat-sse handler activity.`,
);
