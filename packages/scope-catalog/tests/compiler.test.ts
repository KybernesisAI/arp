import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  compileScope,
  loadScopesFromDirectory,
  ScopeCompileError,
} from '../src/index.js';
import type { ScopeTemplate } from '@kybernesis/arp-spec';

const SCOPES_DIR = resolve(__dirname, '..', 'scopes');
const AUDIENCE = 'did:web:ghost.agent';

function byId(scopes: ScopeTemplate[], id: string): ScopeTemplate {
  const found = scopes.find((s) => s.id === id);
  if (!found) throw new Error(`scope ${id} not found`);
  return found;
}

describe('compileScope — golden outputs for the 10 detailed scopes', () => {
  const scopes = loadScopesFromDirectory(SCOPES_DIR);

  it('identity.card.read: parameter-free, audience-substituted permit', () => {
    const out = compileScope({
      scope: byId(scopes, 'identity.card.read'),
      audienceDid: AUDIENCE,
    });
    expect(out).toContain(`principal == Agent::"${AUDIENCE}"`);
    expect(out).toContain('resource == AgentCard::"self"');
    expect(out).not.toContain('{{');
  });

  it('calendar.availability.read: threads days_ahead through the when-clause', () => {
    const out = compileScope({
      scope: byId(scopes, 'calendar.availability.read'),
      audienceDid: AUDIENCE,
      params: { days_ahead: 21 },
    });
    expect(out).toContain('context.query_window_days <= 21');
    expect(out).toContain('forbid');
    expect(out).not.toContain('{{');
  });

  it('calendar.availability.read: uses catalog default when param omitted', () => {
    const out = compileScope({
      scope: byId(scopes, 'calendar.availability.read'),
      audienceDid: AUDIENCE,
    });
    expect(out).toContain('context.query_window_days <= 14');
  });

  it('calendar.events.propose: interpolates both numeric caps', () => {
    const out = compileScope({
      scope: byId(scopes, 'calendar.events.propose'),
      audienceDid: AUDIENCE,
      params: { max_attendees: 25, max_duration_min: 120 },
    });
    expect(out).toContain('context.proposed_attendee_count <= 25');
    expect(out).toContain('context.proposed_duration_min <= 120');
  });

  it('files.project.files.read: substitutes project_id + size cap', () => {
    const out = compileScope({
      scope: byId(scopes, 'files.project.files.read'),
      audienceDid: AUDIENCE,
      params: { project_id: 'alpha', max_size_mb: 25 },
    });
    expect(out).toContain('resource in Project::"alpha"');
    expect(out).toContain('resource.size_bytes <= 25 * 1048576');
    expect(out).toContain('!resource.tags.contains("confidential")');
  });

  it('messaging.email.send.reviewed: no allowlist → true branch', () => {
    const out = compileScope({
      scope: byId(scopes, 'messaging.email.send.reviewed'),
      audienceDid: AUDIENCE,
    });
    expect(out).toContain('action == Action::"send_email"');
    // With empty allowlist, the #if branch falls through to 'true'
    expect(out).toMatch(/\btrue\b/);
  });

  it('messaging.email.send.reviewed: allowlist threaded into Cedar', () => {
    const out = compileScope({
      scope: byId(scopes, 'messaging.email.send.reviewed'),
      audienceDid: AUDIENCE,
      params: { recipient_allowlist: ['alice@example.com', '*@corp.com'] },
    });
    expect(out).toContain(
      'context.recipient_matches_allowlist(["alice@example.com","*@corp.com"])'
    );
  });

  it('payments.authorize.capped: per-txn + rolling 30d caps', () => {
    const out = compileScope({
      scope: byId(scopes, 'payments.authorize.capped'),
      audienceDid: AUDIENCE,
      params: { max_per_txn_usd: 5, max_per_30d_usd: 50 },
    });
    expect(out).toContain('context.quoted_price_usd <= 5');
    expect(out).toContain(
      'context.spend_last_30d_usd + context.quoted_price_usd <= 50'
    );
  });

  it('credentials.proof.zk.request: enum attribute + predicate', () => {
    const out = compileScope({
      scope: byId(scopes, 'credentials.proof.zk.request'),
      audienceDid: AUDIENCE,
      params: { attribute: 'over_18' },
    });
    expect(out).toContain('resource == Credential::"over_18"');
    expect(out).toContain('context.predicate == "eq"');
  });

  it('tools.invoke.mutating: allowlist json + rate limit threaded', () => {
    const out = compileScope({
      scope: byId(scopes, 'tools.invoke.mutating'),
      audienceDid: AUDIENCE,
      params: { tool_allowlist: ['search', 'calc'], max_per_day: 20 },
    });
    expect(out).toContain('resource.id in ["search","calc"]');
    expect(out).toContain('context.requests_last_day <= 20');
  });

  it('delegation.forward.task: agent allowlist + attenuation mode', () => {
    const out = compileScope({
      scope: byId(scopes, 'delegation.forward.task'),
      audienceDid: AUDIENCE,
      params: {
        agent_allowlist: ['did:web:ghost.agent'],
        scope_attenuation: 'read_only',
      },
    });
    expect(out).toContain('context.delegate_target in ["did:web:ghost.agent"]');
    expect(out).toContain('context.attenuation_mode == "read_only"');
  });

  it('contacts.search: audience substituted (no numeric params)', () => {
    const out = compileScope({
      scope: byId(scopes, 'contacts.search'),
      audienceDid: AUDIENCE,
      params: { attribute_allowlist: ['name', 'email'] },
    });
    expect(out).toContain(`principal == Agent::"${AUDIENCE}"`);
    expect(out).not.toContain('{{');
  });
});

describe('compileScope — parameter validation', () => {
  const scopes = loadScopesFromDirectory(SCOPES_DIR);

  it('rejects out-of-range integer parameters', () => {
    expect(() =>
      compileScope({
        scope: byId(scopes, 'calendar.availability.read'),
        audienceDid: AUDIENCE,
        params: { days_ahead: 500 },
      })
    ).toThrow(ScopeCompileError);
  });

  it('rejects non-enum values', () => {
    expect(() =>
      compileScope({
        scope: byId(scopes, 'credentials.proof.zk.request'),
        audienceDid: AUDIENCE,
        params: { attribute: 'over_99' },
      })
    ).toThrow(ScopeCompileError);
  });

  it('rejects missing required parameters', () => {
    expect(() =>
      compileScope({
        scope: byId(scopes, 'files.project.files.read'),
        audienceDid: AUDIENCE,
        params: { max_size_mb: 10 },
      })
    ).toThrow(ScopeCompileError);
  });

  it('rejects invalid audience DID', () => {
    expect(() =>
      compileScope({
        scope: byId(scopes, 'identity.card.read'),
        audienceDid: 'not-a-did',
      })
    ).toThrow(ScopeCompileError);
  });

  it('rejects non-DID members in AgentDIDList params', () => {
    expect(() =>
      compileScope({
        scope: byId(scopes, 'delegation.forward.task'),
        audienceDid: AUDIENCE,
        params: {
          agent_allowlist: ['not-a-did'],
          scope_attenuation: 'read_only',
        },
      })
    ).toThrow(ScopeCompileError);
  });
});
