/**
 * Protocol-level constants for ARP.
 *
 * Source: ARP-tld-integration-spec-v2.md §4 (reserved names), §5 (TTLs), §6 (well-known paths).
 */

export const ARP_VERSION = '0.1' as const;

/** TTL defaults for the DNS records described in the spec (seconds). */
export const TTL_DEFAULTS = {
  /** Apex A/AAAA/TXT records. Spec §5.1: 300. */
  APEX: 300,
  /** TLD-level discoverability records. Spec §8: 3600. */
  TLD: 3600,
} as const;

/** Revocation list poll interval (seconds). Spec §5.1 `_revocation` TXT `poll=300`. */
export const REVOCATION_POLL_INTERVAL_SECONDS = 300;

/** JSON Schema $id base. */
export const SCHEMA_BASE_URL = 'https://arp.spec/schema' as const;

/** Well-known HTTPS paths served by every agent. Spec §6. */
export const WELL_KNOWN_PATHS = {
  DID: '/.well-known/did.json',
  /** ARP's own card. AgentID S5 moved it here; the A2A card owns agent-card.json. */
  AGENT_CARD: '/.well-known/arp-card.json',
  /** A2A v1.0 agent card (the standard's path). */
  A2A_AGENT_CARD: '/.well-known/agent-card.json',
  /** A2A JSON-RPC endpoint on the identity's host. */
  A2A_ENDPOINT: '/a2a',
  /** The identity's public key set (used as `jku` by card signatures). */
  JWKS: '/.well-known/jwks.json',
  ARP: '/.well-known/arp.json',
  POLICY_SCHEMA: '/.well-known/policy-schema.json',
  SCOPE_CATALOG: '/.well-known/scope-catalog.json',
  REPRESENTATION_VC: '/.well-known/representation.jwt',
  REVOCATIONS: '/revocations.json',
} as const;

/** DIDComm mailbox path served by every agent. */
export const DIDCOMM_PATH = '/didcomm';

/** Agent-to-Agent HTTPS path (stubbed in v0). */
export const A2A_PATH = '/a2a';

/** Protocol-reserved second-level names — registrar MUST refuse. Spec §4.1. */
export const PROTOCOL_RESERVED_NAMES: readonly string[] = [
  '_arp',
  '_did',
  '_principal',
  '_didcomm',
  '_revocation',
  '_well-known',
  '_arp-v1',
  '_arp-v2',
  '_arp-v3',
] as const;

/** Infrastructure-reserved SLDs. Spec §4.2. */
export const INFRASTRUCTURE_RESERVED_NAMES: readonly string[] = [
  'system',
  'registry',
  'discovery',
  'directory',
  'gateway',
  'bootstrap',
  'test',
  'example',
] as const;

/** Premium-holdback common words. Spec §4.3. */
export const PREMIUM_HOLDBACK_WORDS: readonly string[] = [
  'my',
  'the',
  'your',
  'our',
  'an',
  'this',
  'that',
] as const;

/** All single letters a-z — premium holdback SLDs. Spec §4.3. */
export const SINGLE_LETTER_HOLDBACKS: readonly string[] = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode(97 + i)
);

/** All single digits 0-9 — premium holdback SLDs. Spec §4.3. */
export const SINGLE_DIGIT_HOLDBACKS: readonly string[] = Array.from({ length: 10 }, (_, i) =>
  String(i)
);

/**
 * DID URI regex. Spec §7.step9 validation pattern.
 * Matches `did:<method>:<method-specific-id>` with permissive method-id charset.
 */
export const DID_URI_REGEX = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;

/**
 * Standard DIDComm v2 accept token.
 */
export const DIDCOMM_V2_ACCEPT = 'didcomm/v2';

/**
 * Canonical supported wire protocols in v0.
 */
export const SUPPORTED_PROTOCOLS = ['didcomm/v2', 'a2a/1.0'] as const;

/** Extension URI under which ARP data rides inside an A2A agent card (AgentID S5). */
export const ARP_A2A_EXTENSION_URI = 'https://arp.run/ext/arp/v1' as const;
/** A2A protocol version we emit. */
export const A2A_PROTOCOL_VERSION = '1.0' as const;

/**
 * Cedar schema namespace used throughout ARP policies.
 */
export const CEDAR_NAMESPACE = 'ARP';

/**
 * Connection token pre-release expiry (default 180 days).
 */
export const CONNECTION_DEFAULT_TTL_DAYS = 180;

/**
 * Handoff-bundle bootstrap token TTL per spec §7.step14 ("exp 15min").
 */
export const BOOTSTRAP_TOKEN_TTL_SECONDS = 15 * 60;
