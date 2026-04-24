/**
 * Reusable valid fixtures. Tests may mutate shallow clones to produce invalid
 * shapes without contaminating the canonical examples.
 */
import type {
  DidDocument,
  AgentCard,
  ArpJson,
  RepresentationVc,
  Revocations,
  ConnectionToken,
  HandoffBundle,
  ScopeTemplate,
} from '../src/index.js';

export const VALID_DID_DOC: DidDocument = {
  '@context': ['https://www.w3.org/ns/did/v1'],
  id: 'did:web:samantha.agent',
  controller: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  verificationMethod: [
    {
      id: 'did:web:samantha.agent#key-1',
      type: 'Ed25519VerificationKey2020',
      controller: 'did:web:samantha.agent',
      publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
    },
  ],
  authentication: ['did:web:samantha.agent#key-1'],
  assertionMethod: ['did:web:samantha.agent#key-1'],
  keyAgreement: ['did:web:samantha.agent#key-1'],
  service: [
    {
      id: 'did:web:samantha.agent#didcomm',
      type: 'DIDCommMessaging',
      serviceEndpoint: 'https://samantha.agent/didcomm',
      accept: ['didcomm/v2'],
    },
    {
      id: 'did:web:samantha.agent#agent-card',
      type: 'AgentCard',
      serviceEndpoint: 'https://samantha.agent/.well-known/agent-card.json',
    },
  ],
  principal: {
    did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    representationVC: 'https://ian.samantha.agent/.well-known/representation.jwt',
  },
};

export const VALID_AGENT_CARD: AgentCard = {
  arp_version: '0.1',
  name: 'Samantha',
  did: 'did:web:samantha.agent',
  description: 'Personal agent',
  created_at: '2026-04-22T00:00:00Z',
  endpoints: {
    didcomm: 'https://samantha.agent/didcomm',
    a2a: 'https://samantha.agent/a2a',
    pairing: 'https://samantha.agent/pair',
  },
  accepted_protocols: ['didcomm/v2', 'a2a/1.0'],
  supported_scopes: [],
  payment: {
    x402_enabled: false,
    currencies: [],
    pricing_url: null,
  },
  vc_requirements: [],
  policy: {
    engine: 'cedar',
    schema: 'https://samantha.agent/.well-known/policy-schema.json',
  },
};

export const VALID_ARP_JSON: ArpJson = {
  version: '0.1',
  capabilities: ['didcomm-v2', 'cedar-pdp', 'ucan-tokens'],
  scope_catalog_url: 'https://samantha.agent/.well-known/scope-catalog.json',
  policy_schema_url: 'https://samantha.agent/.well-known/policy-schema.json',
};

export const VALID_REPRESENTATION_VC: RepresentationVc = {
  iss: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  sub: 'did:web:samantha.agent',
  iat: 1745280000,
  exp: 1776816000,
  vc: {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'AgentRepresentation'],
    credentialSubject: {
      id: 'did:web:samantha.agent',
      representedBy: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      scope: 'full',
      constraints: {
        maxConcurrentConnections: 100,
        allowedTransferOfOwnership: false,
      },
    },
  },
};

export const VALID_REVOCATIONS: Revocations = {
  issuer: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  updated_at: '2026-04-22T00:00:00Z',
  revocations: [
    {
      type: 'connection',
      id: 'conn_7a3f00112233',
      revoked_at: '2026-04-22T10:00:00Z',
      reason: 'user_requested',
    },
    {
      type: 'key',
      fingerprint: 'sha256:abc123abc123abc1',
      revoked_at: '2026-04-15T08:00:00Z',
    },
  ],
  signature: {
    alg: 'EdDSA',
    kid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK#key-1',
    value: 'dGVzdC1zaWduYXR1cmU',
  },
};

export const VALID_CONNECTION_TOKEN: ConnectionToken = {
  connection_id: 'conn_7a3f00112233',
  issuer: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  subject: 'did:web:samantha.agent',
  audience: 'did:web:ghost.agent',
  purpose: 'project:alpha',
  cedar_policies: [
    'permit (principal == Agent::"did:web:ghost.agent", action in [Action::"read", Action::"list"], resource in Project::"alpha");',
  ],
  obligations: [],
  scope_catalog_version: 'v1',
  expires: '2026-10-22T00:00:00Z',
  sigs: {
    ian: 'ZmFrZS1pYW4tc2ln',
    nick: 'ZmFrZS1uaWNrLXNpZw',
  },
};

export const VALID_HANDOFF_BUNDLE: HandoffBundle = {
  agent_did: 'did:web:samantha.agent',
  principal_did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  public_key_multibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
  well_known_urls: {
    did: 'https://samantha.agent/.well-known/did.json',
    agent_card: 'https://samantha.agent/.well-known/agent-card.json',
    arp: 'https://samantha.agent/.well-known/arp.json',
  },
  dns_records_published: [
    'A',
    'AAAA',
    '_arp TXT',
    '_did TXT',
    '_didcomm TXT',
    '_revocation TXT',
    '_principal TXT',
  ],
  cert_expires_at: '2026-07-22T00:00:00Z',
  bootstrap_token: 'eyJhbGciOiJFZERTQSJ9.payload.sig',
};

export const VALID_SCOPE_TEMPLATE: ScopeTemplate = {
  id: 'calendar.availability.read',
  version: '1.0.0',
  label: 'Check availability (free/busy only)',
  description:
    "Peer can see when you're free or busy, but no event titles, attendees, or details.",
  category: 'calendar',
  risk: 'low',
  parameters: [
    {
      name: 'days_ahead',
      type: 'Integer',
      required: true,
      default: 14,
      validation: '1..90',
    },
  ],
  cedar_template:
    'permit (principal == Agent::"{{audience_did}}", action == Action::"check_availability", resource == Calendar::"primary") when { context.query_window_days <= {{days_ahead}} };',
  consent_text_template:
    'Check your free/busy (no details) up to {{days_ahead}} days ahead.',
  obligations_forced: [],
  implies: [],
  conflicts_with: [],
  step_up_required: false,
};

export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
