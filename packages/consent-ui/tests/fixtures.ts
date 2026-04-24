import type { Obligation, ScopeTemplate } from '@kybernesis/arp-spec';
import type { ScopeSelection } from '@kybernesis/arp-pairing';

export interface ConsentScenario {
  name: string;
  input: {
    issuer: string;
    subject: string;
    audience: string;
    purpose: string;
    scopeSelections: ScopeSelection[];
    cedarPolicies: string[];
    obligations: Obligation[];
    expires: string;
    requiredVcs?: string[];
  };
  /** Set at test time from the loaded catalog. */
  catalog?: readonly ScopeTemplate[];
}

const DEFAULTS = {
  issuer: 'did:web:ian.example.agent',
  subject: 'did:web:samantha.agent',
  audience: 'did:web:ghost.agent',
  expires: '2026-10-22T00:00:00Z',
};

/**
 * The ten worked examples tracked by the phase-4 consent-ui acceptance test.
 * Examples 1–3 map 1:1 to `ARP-policy-examples.md §§3–5`. The remaining
 * seven slots pair each Cedar pattern in `§9` with a realistic scope
 * selection so the consent renderer has something meaningful to project.
 */
export const POLICY_EXAMPLES: ConsentScenario[] = [
  {
    name: 'example-1-minimal',
    input: {
      ...DEFAULTS,
      purpose: 'Project Alpha',
      scopeSelections: [
        { id: 'files.projects.list' },
        {
          id: 'files.project.files.read',
          params: { project_id: 'alpha', max_size_mb: 25 },
        },
      ],
      cedarPolicies: [],
      obligations: [],
    },
  },
  {
    name: 'example-2-scoped',
    input: {
      ...DEFAULTS,
      purpose: 'Project Alpha',
      scopeSelections: [
        {
          id: 'files.project.files.read',
          params: { project_id: 'alpha', max_size_mb: 25 },
        },
        {
          id: 'files.project.files.summarize',
          params: { project_id: 'alpha', max_output_words: 2000 },
        },
        { id: 'calendar.availability.read', params: { days_ahead: 14 } },
      ],
      cedarPolicies: [],
      obligations: [
        { type: 'redact_fields', params: { fields: ['client.name', 'client.email'] } },
        {
          type: 'time_window',
          params: {
            days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
            start_hour: 9,
            end_hour: 17,
            timezone: 'America/New_York',
          },
        },
        { type: 'spend_cap_per_txn', params: { max_usd: 5 } },
        {
          type: 'spend_cap_window',
          params: { max_usd: 50, window_seconds: 30 * 86400 },
        },
      ],
      requiredVcs: ['self_xyz.verified_human', 'self_xyz.over_18'],
    },
  },
  {
    name: 'example-3-advanced-obligations',
    input: {
      ...DEFAULTS,
      purpose: 'Project Alpha',
      scopeSelections: [
        {
          id: 'files.project.files.read',
          params: { project_id: 'alpha', max_size_mb: 25 },
        },
        {
          id: 'files.project.files.summarize',
          params: { project_id: 'alpha', max_output_words: 2000 },
        },
      ],
      cedarPolicies: [],
      obligations: [
        {
          type: 'redact_fields',
          params: { fields: ['client.name', 'client.email', 'client.phone'] },
        },
        { type: 'rate_limit', params: { max_requests_per_hour: 60 } },
        {
          type: 'require_fresh_consent',
          params: {
            max_age_seconds: 300,
            prompt: 'Ghost is requesting export of multiple files',
          },
        },
      ],
      requiredVcs: ['self_xyz.verified_human'],
    },
  },
  {
    name: 'pattern-time-bounded-access',
    input: {
      ...DEFAULTS,
      purpose: 'Project Alpha',
      scopeSelections: [
        {
          id: 'files.project.files.read',
          params: { project_id: 'alpha', max_size_mb: 10 },
        },
      ],
      cedarPolicies: [],
      obligations: [
        { type: 'delete_after', params: { ttl_seconds: 90 * 86400 } },
      ],
      expires: '2026-10-22T00:00:00Z',
    },
  },
  {
    name: 'pattern-step-up-consent',
    input: {
      ...DEFAULTS,
      purpose: 'Project Alpha bulk export',
      scopeSelections: [
        {
          id: 'files.project.files.read',
          params: { project_id: 'alpha', max_size_mb: 25 },
        },
        { id: 'files.share.external', params: { project_id: 'alpha', recipient_allowlist: ['external@example.com'] } },
      ],
      cedarPolicies: [],
      obligations: [
        {
          type: 'require_fresh_consent',
          params: {
            max_age_seconds: 300,
            prompt: 'Bulk export to external recipient',
          },
        },
      ],
      requiredVcs: ['self_xyz.verified_human'],
    },
  },
  {
    name: 'pattern-reputation-gate',
    input: {
      ...DEFAULTS,
      purpose: 'Vetted research agent',
      scopeSelections: [
        { id: 'knowledge.query', params: { kb_id: 'alpha', max_tokens: 4000 } },
      ],
      cedarPolicies: [],
      obligations: [
        { type: 'log_audit_level', params: { level: 'verbose' } },
      ],
      requiredVcs: ['self_xyz.verified_human'],
    },
  },
  {
    name: 'pattern-attribute-gated-sharing',
    input: {
      ...DEFAULTS,
      purpose: 'Cross-border disclosure',
      scopeSelections: [
        { id: 'contacts.share', params: { recipient_allowlist: ['vendor@example.com'] } },
      ],
      cedarPolicies: [],
      obligations: [],
      requiredVcs: ['self_xyz.us_resident', 'self_xyz.over_18'],
    },
  },
  {
    name: 'pattern-spending-ratchet',
    input: {
      ...DEFAULTS,
      purpose: 'Procurement with tight caps',
      scopeSelections: [
        {
          id: 'payments.authorize.capped',
          params: { max_per_txn_usd: 25, max_per_30d_usd: 50 },
        },
      ],
      cedarPolicies: [],
      obligations: [
        { type: 'spend_cap_per_txn', params: { max_usd: 25 } },
        {
          type: 'spend_cap_window',
          params: { max_usd: 50, window_seconds: 30 * 86400 },
        },
      ],
      requiredVcs: ['self_xyz.verified_human'],
    },
  },
  {
    name: 'pattern-purpose-binding',
    input: {
      ...DEFAULTS,
      purpose: 'Scheduling assistant',
      scopeSelections: [
        { id: 'calendar.availability.read', params: { days_ahead: 14 } },
        {
          id: 'calendar.events.propose',
          params: { max_attendees: 10, max_duration_min: 60 },
        },
      ],
      cedarPolicies: [],
      obligations: [
        { type: 'notify_principal', params: {} },
      ],
    },
  },
  {
    name: 'pattern-blast-radius-clamp',
    input: {
      ...DEFAULTS,
      purpose: 'Research agent (size-clamped)',
      scopeSelections: [
        {
          id: 'files.project.files.read',
          params: { project_id: 'alpha', max_size_mb: 10 },
        },
        {
          id: 'files.project.files.summarize',
          params: { project_id: 'alpha', max_output_words: 1000 },
        },
      ],
      cedarPolicies: [],
      obligations: [
        { type: 'summarize_only', params: { max_words: 1000 } },
      ],
    },
  },
  {
    name: 'pattern-no-onward-sharing',
    input: {
      ...DEFAULTS,
      purpose: 'Privileged read, no onward share',
      scopeSelections: [
        {
          id: 'files.project.files.read',
          params: { project_id: 'alpha', max_size_mb: 10 },
        },
      ],
      cedarPolicies: [],
      obligations: [
        { type: 'no_downstream_share', params: {} },
        {
          type: 'insert_watermark',
          params: {},
        },
      ],
      requiredVcs: ['self_xyz.verified_human'],
    },
  },
  {
    name: 'pattern-generic-vc-provider',
    input: {
      ...DEFAULTS,
      purpose: 'Generic-provider VC rendering',
      scopeSelections: [
        {
          id: 'files.project.files.read',
          params: { project_id: 'alpha', max_size_mb: 10 },
        },
      ],
      cedarPolicies: [],
      obligations: [],
      requiredVcs: ['custom.verified_human'],
    },
  },
];
