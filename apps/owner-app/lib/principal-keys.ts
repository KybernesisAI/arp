import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { env } from './env';

/**
 * Principal DID → hex-encoded Ed25519 public key table. Sourced from
 * `principals.json` alongside the owner-app directory (never bundled into
 * client code). v0 only supports a single principal, but the schema is
 * forward-compatible with multi-principal owner UIs that land in v0.2.
 *
 * JSON shape (example):
 *   {
 *     "did:web:ian.self.xyz": { "publicKeyHex": "..." }
 *   }
 */
interface PrincipalKeyEntry {
  publicKeyHex: string;
}
type PrincipalKeyFile = Record<string, PrincipalKeyEntry>;

let cached: PrincipalKeyFile | null = null;

function principalsPath(): string {
  return (
    process.env.ARP_PRINCIPAL_KEYS_PATH ??
    resolve(process.cwd(), 'principals.json')
  );
}

function load(): PrincipalKeyFile {
  if (cached) return cached;
  const path = principalsPath();
  if (!existsSync(path)) {
    cached = {};
    return cached;
  }
  try {
    cached = JSON.parse(readFileSync(path, 'utf8')) as PrincipalKeyFile;
  } catch (err) {
    throw new Error(
      `failed to parse principal keys at ${path}: ${(err as Error).message}`,
    );
  }
  return cached;
}

export function publicKeyForPrincipal(did: string): Uint8Array | null {
  const table = load();
  const entry = table[did];
  if (!entry) return null;
  const buf = Buffer.from(entry.publicKeyHex, 'hex');
  if (buf.length !== 32) return null;
  return new Uint8Array(buf);
}

export function configuredPrincipalDid(): string {
  return env().ARP_PRINCIPAL_DID;
}
