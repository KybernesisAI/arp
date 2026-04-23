/**
 * SDK-local bootstrap: load or generate Ed25519 agent keys and verify them
 * against the handoff's public-key commitment.
 *
 * This is functionally equivalent to the sidecar's bootstrap — the SDK
 * re-implements it because the sidecar couples disk layout, TLS cert
 * generation, and well-known file writing to the Docker deployment model.
 * In-process agents don't need those: they write only the private key and
 * ask the runtime to build well-known docs in memory. Keeping this local
 * avoids a circular dep through @kybernesis/arp-sidecar.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { HandoffBundleSchema, type HandoffBundle } from '@kybernesis/arp-spec';

export interface BootstrapResult {
  handoff: HandoffBundle;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyMultibase: string;
  firstBoot: boolean;
}

export interface BootstrapInput {
  /**
   * Either the parsed handoff JSON or a filesystem path. Absolute paths are
   * used verbatim; relative paths resolve against process.cwd().
   */
  handoff: HandoffBundle | string | Record<string, unknown>;
  /**
   * Writable directory for the private key file (and other future state).
   */
  dataDir: string;
  /**
   * Optional pre-loaded private key. When provided, the SDK still validates
   * that the derived public key matches the handoff commitment, but skips
   * disk I/O. Callers handling their own keystore (HSM, TPM, cloud KMS)
   * should use this.
   */
  privateKey?: Uint8Array;
}

export async function bootstrapSdk(input: BootstrapInput): Promise<BootstrapResult> {
  const handoff = loadHandoff(input.handoff);
  mkdirSync(input.dataDir, { recursive: true });
  const keysDir = join(input.dataDir, 'keys');
  mkdirSync(keysDir, { recursive: true });
  const privateKeyPath = join(keysDir, 'private.key');

  let privateKey: Uint8Array;
  let firstBoot = false;
  if (input.privateKey) {
    if (input.privateKey.length !== 32) {
      throw new Error(
        `injected private key must be 32 bytes, got ${input.privateKey.length}`,
      );
    }
    privateKey = input.privateKey;
  } else if (existsSync(privateKeyPath)) {
    const raw = readFileSync(privateKeyPath);
    if (raw.length !== 32) {
      throw new Error(
        `corrupt keystore: ${privateKeyPath} must be 32 bytes, got ${raw.length}`,
      );
    }
    privateKey = new Uint8Array(raw);
  } else {
    firstBoot = true;
    privateKey = ed25519.utils.randomPrivateKey();
    writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
    ensure0600(privateKeyPath);
  }

  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  const publicKeyMultibase = ed25519RawToMultibase(publicKey);

  if (publicKeyMultibase !== handoff.public_key_multibase) {
    throw new Error(
      `handoff public-key commitment mismatch: expected ${handoff.public_key_multibase}, got ${publicKeyMultibase}. Refusing to boot — either the keystore was swapped, or the handoff targets a different agent.`,
    );
  }

  return { handoff, privateKey, publicKey, publicKeyMultibase, firstBoot };
}

function loadHandoff(
  input: HandoffBundle | string | Record<string, unknown>,
): HandoffBundle {
  if (typeof input === 'string') {
    const raw = readFileSync(input, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    rejectHandoffWithPrivateKey(parsed);
    return HandoffBundleSchema.parse(parsed);
  }
  rejectHandoffWithPrivateKey(input);
  return HandoffBundleSchema.parse(input);
}

function rejectHandoffWithPrivateKey(value: unknown, path = '$'): void {
  if (value === null || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/^priv(?:ate)?[_-]?key/i.test(k) || /^secret/i.test(k)) {
      throw new Error(
        `handoff bundle contains forbidden field "${path}.${k}"; private key material must never ship in a handoff`,
      );
    }
    rejectHandoffWithPrivateKey(v, `${path}.${k}`);
  }
}

function ensure0600(path: string): void {
  try {
    chmodSync(path, 0o600);
    const s = statSync(path);
    // eslint-disable-next-line no-bitwise
    if ((s.mode & 0o777) !== 0o600) {
      // Not fatal on platforms without POSIX perms (Windows-mounted FS).
    }
  } catch {
    // ignore on non-POSIX hosts
  }
  // Silence unused import lints.
  void dirname;
}
