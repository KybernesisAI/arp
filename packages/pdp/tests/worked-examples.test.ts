import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPdp } from '../src/index.js';
import type { EvaluateInput } from '../src/types.js';

/**
 * Cedar schema loaded once. Injected at PDP construction; v0 does not enforce
 * it at request time (see pdp.ts for rationale).
 *
 * Worked examples from `docs/ARP-policy-examples.md`. Money + timestamp
 * context values are expressed as integers (cents + epoch ms) because Cedar's
 * runtime type system is integer/boolean/string/set/record — float literals
 * aren't supported. The doc's `quoted_price_usd <= 5` narrative renders here
 * as `quoted_price_cents <= 500`, which is the production convention.
 */
const SCHEMA = readFileSync(
  resolve(__dirname, '..', '..', 'spec', 'src', 'cedar-schema.json'),
  'utf8',
);
const pdp = createPdp(SCHEMA);

const GHOST: EvaluateInput['principal'] = {
  type: 'Agent',
  id: 'did:web:ghost.agent',
  attrs: { reputation_score: 80 },
};

const ALPHA: EvaluateInput['resource'] = {
  type: 'Project',
  id: 'alpha',
  attrs: { tags: [], classification: 'internal' },
};

const NOW_MS = Date.parse('2026-04-22T14:30:00-04:00');
const EXPIRY_MS = Date.parse('2026-10-22T00:00:00Z');

function ctx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    time: {
      now_ms: NOW_MS,
      hour: 14,
      day_of_week: 'Wed',
      within_business_hours: true,
      timezone: 'America/New_York',
      is_holiday: false,
    },
    presented_vcs: ['self_xyz.verified_human', 'self_xyz.over_18'],
    quoted_price_cents: 2,
    spend_last_30d_cents: 318,
    connection: { expires_at_ms: EXPIRY_MS },
    schedule_window_days: 7,
    stated_purpose_category: 'research',
    ...overrides,
  };
}

/* ---------------- Example 1 — minimal policy ------------------------ */

const MINIMAL_POLICY = `
permit (
  principal == Agent::"did:web:ghost.agent",
  action in [Action::"read", Action::"list"],
  resource in Project::"alpha"
);
`;

describe('Policy example 1 — minimal read/list permit', () => {
  it('allows Ghost to read project files', () => {
    const d = pdp.evaluate({
      cedarPolicies: [MINIMAL_POLICY],
      principal: GHOST,
      action: 'read',
      resource: {
        type: 'Document',
        id: 'alpha/q2-notes',
        parents: [{ type: 'Project', id: 'alpha' }],
        attrs: { tags: [], classification: 'internal', data_categories: [] },
      },
    });
    expect(d.decision).toBe('allow');
  });

  it('denies when the action is out of scope', () => {
    const d = pdp.evaluate({
      cedarPolicies: [MINIMAL_POLICY],
      principal: GHOST,
      action: 'write',
      resource: ALPHA,
    });
    expect(d.decision).toBe('deny');
  });
});

/* ---------------- Example 2 — scoped policy -------------------------- */

const SCOPED_POLICIES = [
  `
permit (
  principal == Agent::"did:web:ghost.agent",
  action in [Action::"read", Action::"list", Action::"summarize"],
  resource in Project::"alpha"
) when {
  context.time.within_business_hours &&
  ["Mon","Tue","Wed","Thu","Fri"].contains(context.time.day_of_week) &&
  context.presented_vcs.contains("self_xyz.verified_human") &&
  context.presented_vcs.contains("self_xyz.over_18") &&
  context.quoted_price_cents <= 500 &&
  context.spend_last_30d_cents + context.quoted_price_cents <= 5000
};
forbid (
  principal,
  action,
  resource
) when {
  resource.tags.contains("confidential") ||
  resource.tags.contains("client-list")
};
`,
];

describe('Policy example 2 — scoped permit + forbid', () => {
  it('allows a summarize during business hours with VCs + spend in-bounds', () => {
    const d = pdp.evaluate({
      cedarPolicies: SCOPED_POLICIES,
      principal: GHOST,
      action: 'summarize',
      resource: {
        type: 'Document',
        id: 'alpha/q2-research',
        parents: [{ type: 'Project', id: 'alpha' }],
        attrs: { tags: ['research'], classification: 'internal', data_categories: [] },
      },
      context: ctx(),
    });
    expect(d.decision).toBe('allow');
  });

  it('denies when a resource tag is on the forbid list', () => {
    const d = pdp.evaluate({
      cedarPolicies: SCOPED_POLICIES,
      principal: GHOST,
      action: 'summarize',
      resource: {
        type: 'Document',
        id: 'alpha/client-roster',
        parents: [{ type: 'Project', id: 'alpha' }],
        attrs: {
          tags: ['client-list'],
          classification: 'confidential',
          data_categories: ['pii'],
        },
      },
      context: ctx(),
    });
    expect(d.decision).toBe('deny');
  });

  it('denies when the spend cap is exceeded', () => {
    const d = pdp.evaluate({
      cedarPolicies: SCOPED_POLICIES,
      principal: GHOST,
      action: 'summarize',
      resource: {
        type: 'Document',
        id: 'alpha/doc',
        parents: [{ type: 'Project', id: 'alpha' }],
        attrs: { tags: [], classification: 'internal', data_categories: [] },
      },
      context: ctx({ quoted_price_cents: 300, spend_last_30d_cents: 4800 }),
    });
    expect(d.decision).toBe('deny');
  });
});

/* ---------------- Example 3 — obligations --------------------------- */

const OBLIGATION_POLICIES = [
  `
@obligation("redact_fields")
@obligation_params({ "fields": ["client.name", "client.email", "client.phone"] })
permit (
  principal == Agent::"did:web:ghost.agent",
  action == Action::"read",
  resource in Project::"alpha"
);
`,
  `
@obligation("rate_limit")
@obligation_params({ "max_requests_per_hour": 60 })
permit (
  principal == Agent::"did:web:ghost.agent",
  action,
  resource in Project::"alpha"
);
`,
];

describe('Policy example 3 — obligations', () => {
  it('returns both redact_fields and rate_limit on an allow', () => {
    const d = pdp.evaluate({
      cedarPolicies: [MINIMAL_POLICY],
      obligationPolicies: OBLIGATION_POLICIES,
      principal: GHOST,
      action: 'read',
      resource: {
        type: 'Document',
        id: 'alpha/doc',
        parents: [{ type: 'Project', id: 'alpha' }],
        attrs: { tags: [], classification: 'internal', data_categories: [] },
      },
      context: ctx(),
    });
    expect(d.decision).toBe('allow');
    const types = d.obligations.map((o) => o.type).sort();
    expect(types).toEqual(['rate_limit', 'redact_fields']);
    const redact = d.obligations.find((o) => o.type === 'redact_fields');
    expect(redact?.params).toEqual({
      fields: ['client.name', 'client.email', 'client.phone'],
    });
  });

  it('does NOT emit obligations when the decision is deny', () => {
    const d = pdp.evaluate({
      cedarPolicies: [MINIMAL_POLICY],
      obligationPolicies: OBLIGATION_POLICIES,
      principal: GHOST,
      action: 'write',
      resource: ALPHA,
    });
    expect(d.decision).toBe('deny');
    expect(d.obligations).toHaveLength(0);
  });
});

/* ---------------- Patterns — §9 ----------------------------------- */

describe('Policy pattern — time-bounded access', () => {
  const POLICY = `
permit (principal == Agent::"did:web:ghost.agent", action, resource)
when { context.time.now_ms < ${EXPIRY_MS} };
`;
  it('allows before expiry, denies after', () => {
    const before = pdp.evaluate({
      cedarPolicies: [POLICY],
      principal: GHOST,
      action: 'read',
      resource: ALPHA,
      context: { time: { now_ms: NOW_MS } },
    });
    expect(before.decision).toBe('allow');
    const after = pdp.evaluate({
      cedarPolicies: [POLICY],
      principal: GHOST,
      action: 'read',
      resource: ALPHA,
      context: { time: { now_ms: Date.parse('2027-01-01T00:00:00Z') } },
    });
    expect(after.decision).toBe('deny');
  });
});

describe('Policy pattern — reputation gate', () => {
  const POLICY = `
permit (principal, action in [Action::"read"], resource in Project::"alpha")
when { principal.reputation_score >= 70 };
`;
  it('allows high reputation, denies low reputation', () => {
    const high = pdp.evaluate({
      cedarPolicies: [POLICY],
      principal: { ...GHOST, attrs: { reputation_score: 80 } },
      action: 'read',
      resource: ALPHA,
    });
    expect(high.decision).toBe('allow');
    const low = pdp.evaluate({
      cedarPolicies: [POLICY],
      principal: { ...GHOST, attrs: { reputation_score: 40 } },
      action: 'read',
      resource: ALPHA,
    });
    expect(low.decision).toBe('deny');
  });
});

describe('Policy pattern — blast-radius clamp', () => {
  const POLICY = `
permit (principal == Agent::"did:web:ghost.agent", action, resource in Project::"alpha");
forbid (principal, action, resource)
when { resource.size_bytes > 10000000 };
`;
  it('denies reads over the size cap', () => {
    const d = pdp.evaluate({
      cedarPolicies: [POLICY],
      principal: GHOST,
      action: 'read',
      resource: {
        type: 'Document',
        id: 'alpha/huge',
        parents: [{ type: 'Project', id: 'alpha' }],
        attrs: {
          tags: [],
          classification: 'internal',
          data_categories: [],
          size_bytes: 20_000_000,
        },
      },
    });
    expect(d.decision).toBe('deny');
  });
});
