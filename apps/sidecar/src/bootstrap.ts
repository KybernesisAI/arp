import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  statSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import * as ed25519 from '@noble/ed25519';
import {
  HandoffBundleSchema,
  type HandoffBundle,
  type DidDocument,
  type AgentCard,
  type ArpJson,
} from '@kybernesis/arp-spec';
import {
  buildAgentCard,
  buildArpJson,
  buildDidDocument,
} from '@kybernesis/arp-templates';
import { generateAgentCert } from '@kybernesis/arp-tls';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { log } from './log.js';

export interface BootstrapPaths {
  dataDir: string;
  handoffPath: string;
}

export interface BootstrapResult {
  /** Raw 32-byte Ed25519 private key, loaded or generated. */
  privateKey: Uint8Array;
  /** Derived public key, multibase-encoded. */
  publicKeyMultibase: string;
  /** SHA-256 fingerprint of the TLS cert (lowercase hex). */
  tlsFingerprint: string;
  /** Absolute path of the cert PEM on disk. */
  tlsCertPath: string;
  /** Absolute path of the cert private key PEM on disk. */
  tlsKeyPath: string;
  /** Cached well-known docs. */
  didDocument: DidDocument;
  agentCard: AgentCard;
  arpJson: ArpJson;
  /** Whether this run touched disk (false = pure idempotent second boot). */
  firstBoot: boolean;
  /** Parsed handoff bundle. */
  handoff: HandoffBundle;
}

export interface BootstrapOptions {
  /** Override the agent display name. Defaults to the DID's first host label. */
  agentName?: string;
  /** Override the agent description. */
  agentDescription?: string;
  /** Scope catalog version pin. Defaults to v1. */
  scopeCatalogVersion?: string;
  /**
   * If true, skip writing well-known artifacts that already match in-memory
   * content. Used by the idempotency test.
   */
  assertIdempotent?: boolean;
}

/**
 * Idempotent first-boot + subsequent-boot bootstrap.
 *
 * Side effects (all write-once, skipped on rerun):
 * - `<data>/keys/private.key` — raw 32-byte Ed25519 seed, 0600
 * - `<data>/keys/public.key.multibase` — z-base58btc public key
 * - `<data>/certs/agent.pem` + `agent.key` — self-signed X.509 + PEM key, 0600 on the key
 * - `<data>/certs/fingerprint.txt` — sha256 hex of DER
 * - `<data>/well-known/{did.json,agent-card.json,arp.json}` — cached JSON
 * - `<data>/audit/` directory
 *
 * Phase 3 rule: if `keys/private.key` is absent OR present but its derived
 * public key does not match `handoff.public_key_multibase`, boot FAILS.
 * The private key must never originate from the handoff bundle itself.
 */
export async function bootstrap(
  paths: BootstrapPaths,
  opts: BootstrapOptions = {},
): Promise<BootstrapResult> {
  const handoff = loadHandoff(paths.handoffPath);
  const { dataDir } = paths;
  const keysDir = join(dataDir, 'keys');
  const certsDir = join(dataDir, 'certs');
  const wellKnownDir = join(dataDir, 'well-known');
  const auditDir = join(dataDir, 'audit');

  mkdirSync(keysDir, { recursive: true });
  mkdirSync(certsDir, { recursive: true });
  mkdirSync(wellKnownDir, { recursive: true });
  mkdirSync(auditDir, { recursive: true });

  const privateKeyPath = join(keysDir, 'private.key');
  const publicKeyPath = join(keysDir, 'public.key.multibase');
  const certPath = join(certsDir, 'agent.pem');
  const keyPemPath = join(certsDir, 'agent.key');
  const fingerprintPath = join(certsDir, 'fingerprint.txt');
  const didDocPath = join(wellKnownDir, 'did.json');
  const agentCardPath = join(wellKnownDir, 'agent-card.json');
  const arpJsonPath = join(wellKnownDir, 'arp.json');

  /* ---- 1. Key material ---- */
  let privateKey: Uint8Array;
  let firstBoot = false;
  if (existsSync(privateKeyPath)) {
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
  const publicKeyMb = ed25519RawToMultibase(publicKey);

  /* ---- 2. Commitment check (HARD GATE) ---- */
  if (publicKeyMb !== handoff.public_key_multibase) {
    throw new Error(
      `handoff public-key commitment mismatch: expected ${handoff.public_key_multibase}, got ${publicKeyMb}. Refusing to boot — either the keystore was swapped under the handoff, or the handoff targets a different agent.`,
    );
  }

  if (!existsSync(publicKeyPath)) {
    writeFileSync(publicKeyPath, publicKeyMb, { mode: 0o644 });
  }

  /* ---- 3. TLS cert ---- */
  let tlsFingerprint: string;
  if (
    existsSync(certPath) &&
    existsSync(keyPemPath) &&
    existsSync(fingerprintPath)
  ) {
    tlsFingerprint = readFileSync(fingerprintPath, 'utf8').trim();
  } else {
    firstBoot = true;
    const certResult = await generateAgentCert({ did: handoff.agent_did });
    if (!certResult.ok) {
      throw new Error(
        `failed to generate self-signed TLS cert: ${certResult.error.message}`,
      );
    }
    const { certPem, keyPem, fingerprint } = certResult.value;
    writeFileSync(certPath, certPem, { mode: 0o644 });
    writeFileSync(keyPemPath, keyPem, { mode: 0o600 });
    ensure0600(keyPemPath);
    writeFileSync(fingerprintPath, fingerprint, { mode: 0o644 });
    tlsFingerprint = fingerprint;
  }

  /* ---- 4. Well-known docs ---- */
  const agentOrigin = originFromUrl(handoff.well_known_urls.arp);
  const representationVcUrl = `${agentOrigin}/.well-known/representation.jwt`;
  const didcommUrl = `${agentOrigin}/didcomm`;

  const didDocument = buildDidDocument({
    agentDid: handoff.agent_did,
    controllerDid: handoff.principal_did,
    publicKeyMultibase: publicKeyMb,
    endpoints: {
      didcomm: didcommUrl,
      agentCard: handoff.well_known_urls.agent_card,
    },
    representationVcUrl,
  });

  const agentCard = buildAgentCard({
    did: handoff.agent_did,
    name: opts.agentName ?? deriveAgentName(handoff.agent_did),
    description: opts.agentDescription ?? 'Personal agent',
    endpoints: {
      didcomm: didcommUrl,
      pairing: `${agentOrigin}/pair`,
    },
    supportedScopes: [],
    vcRequirements: [],
    agentOrigin,
  });

  const arpJson = buildArpJson({ agentOrigin });

  writeJsonIfChanged(didDocPath, didDocument);
  writeJsonIfChanged(agentCardPath, agentCard);
  writeJsonIfChanged(arpJsonPath, arpJson);

  log().info(
    {
      did: handoff.agent_did,
      tls_fingerprint: tlsFingerprint,
      handoff_cert_expires_at: handoff.cert_expires_at,
      first_boot: firstBoot,
    },
    'sidecar bootstrap complete',
  );

  return {
    privateKey,
    publicKeyMultibase: publicKeyMb,
    tlsFingerprint,
    tlsCertPath: certPath,
    tlsKeyPath: keyPemPath,
    didDocument,
    agentCard,
    arpJson,
    firstBoot,
    handoff,
  };
}

export function loadHandoff(path: string): HandoffBundle {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  const raw = readFileSync(abs, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  rejectHandoffWithPrivateKey(parsed);
  return HandoffBundleSchema.parse(parsed);
}

/**
 * Defensive: the Phase 2 §8 decision forbids the handoff from containing a
 * private key. The schema doesn't allow one either, but an attacker-crafted
 * file could include extra fields. Scan the raw JSON and reject if we see
 * any `private*` key name — no risk of silently accepting seeded material.
 */
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

function writeJsonIfChanged(path: string, value: unknown): void {
  const serialized = JSON.stringify(value, null, 2) + '\n';
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (current === serialized) return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serialized, { mode: 0o644 });
}

function ensure0600(path: string): void {
  try {
    chmodSync(path, 0o600);
    const s = statSync(path);
    // eslint-disable-next-line no-bitwise
    if ((s.mode & 0o777) !== 0o600) {
      // Not fatal on platforms without POSIX perms, but surface it.
      log().warn(
        { path, actual_mode: (s.mode & 0o777).toString(8) },
        'keystore file is not 0600',
      );
    }
  } catch {
    // chmod may fail on Windows-mounted filesystems; not fatal.
  }
}

function originFromUrl(fullUrl: string): string {
  const u = new URL(fullUrl);
  return `${u.protocol}//${u.host}`;
}

function deriveAgentName(did: string): string {
  const parts = did.split(':');
  const host = parts[2];
  if (!host) return 'agent';
  const firstLabel = host.split('.')[0];
  if (!firstLabel) return 'agent';
  return firstLabel.charAt(0).toUpperCase() + firstLabel.slice(1);
}
