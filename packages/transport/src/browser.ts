/**
 * Browser-safe subset of `@kybernesis/arp-transport`.
 *
 * The root `@kybernesis/arp-transport` entry pulls in the SQLite mailbox
 * (`better-sqlite3`) and Node filesystem APIs (keystore); that's fine for
 * server-side runtime + sidecar code but breaks Next.js client bundles.
 *
 * Import this entry (`@kybernesis/arp-transport/browser`) from client
 * components and browser-only modules — it re-exports only the base64url +
 * multibase helpers that have zero Node runtime dependencies.
 */

export {
  base64urlDecode,
  base64urlEncode,
  multibaseEd25519ToRaw,
  ed25519RawToMultibase,
} from './envelope.js';
