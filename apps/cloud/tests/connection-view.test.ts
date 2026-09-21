import { describe, expect, it } from 'vitest';
import { buildConnectionView, describeObligation, describePolicy, plainName } from '../lib/connection-view';

const P = (did: string, action: string, res: string) => `permit (\n  principal == Agent::"${did}",\n  action == Action::"${action}",\n  resource == ${res}\n);`;

describe('connection view (plain language)', () => {
  it('names, never identifiers', () => {
    expect(plainName('did:web:kyber.agent')).toBe('kyber.agent');
    expect(plainName('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')).toMatch(/…/);
  });

  it('maps a Cedar permit to the catalog label', () => {
    expect(describePolicy(P('did:web:sid.agent', 'read', 'WorkStatus::"self"'))).toEqual({ actorDid: 'did:web:sid.agent', label: 'Current work status' });
    expect(describePolicy(P('did:web:sid.agent', 'relay_to_principal', 'Principal::"self"'))).toEqual({ actorDid: 'did:web:sid.agent', label: 'Relay message to owner' });
    expect(describePolicy(P('did:web:sid.agent', 'frobnicate', 'Widget::"x"'))?.label).toBe('frobnicate · Widget');
    expect(describePolicy('forbid (principal, action, resource);')).toBeNull();
  });

  it('obligations in words', () => {
    expect(describeObligation({ type: 'rate_limit', params: { max: 10, window: 'hour' } })).toBe('At most 10 messages per hour');
    expect(describeObligation({ type: 'notify_principal' })).toMatch(/notified/);
  });

  it('groups grants per actor, your agent last, and dedupes conditions', () => {
    const names = new Map([['did:web:kyber.agent', 'kyber.agent'], ['did:web:sid.agent', 'sid.agent']]);
    const v = buildConnectionView(
      {
        connectionId: 'conn_x',
        agentDid: 'did:web:sid.agent',
        peerDid: 'did:web:kyber.agent',
        purpose: 'policy test',
        status: 'active',
        cedarPolicies: [
          P('did:web:sid.agent', 'relay_to_principal', 'Principal::"self"'),
          P('did:web:sid.agent', 'read', 'WorkStatus::"self"'),
          P('did:web:kyber.agent', 'relay_to_principal', 'Principal::"self"'),
          P('did:web:kyber.agent', 'list', 'WorkProjects::"self"'),
        ],
        obligations: [{ type: 'rate_limit', params: { max: 10, window: 'hour' } }, { type: 'rate_limit', params: { max: 10, window: 'hour' } }],
        createdAt: new Date('2026-09-20T13:39:01Z'),
        expiresAt: new Date('2026-10-20T13:39:01Z'),
        lastMessageAt: null,
        revokeReason: null,
      },
      names,
    );
    expect(v.mine.name).toBe('sid.agent');
    expect(v.peer.name).toBe('kyber.agent');
    expect(v.grants.map((g) => g.actorName)).toEqual(['kyber.agent', 'sid.agent']);
    expect(v.grants[0]!.may).toEqual(['Relay message to owner', 'Current active projects']);
    expect(v.grants[1]!.may).toEqual(['Relay message to owner', 'Current work status']);
    expect(v.conditions).toEqual(['At most 10 messages per hour']);
  });
});
