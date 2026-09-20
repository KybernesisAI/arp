import { describe, expect, it } from 'vitest';
import { agentAvatarUrl, agentProfileUrl, buildAgentProfileDocument, buildDidDocument } from '../src/index.js';

describe('agent profile document (AgentID S6c)', () => {
  it('builds the public profile with nip05 only when a nostr link is verified', () => {
    const base = {
      did: 'did:web:kyber.agent',
      handle: 'kyber',
      name: 'Kyber',
      description: 'Ops agent',
      picture: 'https://kyber.agent.arp.run/avatar.png',
      accent: '#10b981',
      profileUrl: 'https://agent.arp.run/kyber',
      origin: 'https://kyber.agent.arp.run/',
      updatedAt: '2026-09-21T00:00:00.000Z',
    };
    const withNostr = buildAgentProfileDocument({ ...base, links: [{ kind: 'nostr', value: 'ab'.repeat(32), verified_at: '2026-09-20T13:28:25.774Z' }] });
    expect(withNostr).toMatchObject({
      schema_version: '1.0',
      domain: 'kyber.agent',
      nip05: '_@kyber.agent',
      identity_document: 'https://kyber.agent.arp.run/.well-known/did.json',
      agent_card: 'https://kyber.agent.arp.run/.well-known/agent-card.json',
    });
    const without = buildAgentProfileDocument({ ...base, picture: null, links: [{ kind: 'runtime', value: 'https://kyber.exe.xyz/eve/v1/arp', verified_at: '2026-09-18T09:06:30.583Z' }] });
    expect(without.nip05).toBeNull();
    expect(without.picture).toBeNull();
  });

  it('url helpers', () => {
    expect(agentAvatarUrl('https://kyber.agent.arp.run/', true)).toBe('https://kyber.agent.arp.run/avatar.png');
    expect(agentAvatarUrl('https://kyber.agent.arp.run', false)).toBeNull();
    expect(agentProfileUrl('https://kyber.agent.arp.run')).toBe('https://kyber.agent.arp.run/.well-known/agent-profile.json');
  });

  it('the identity document carries the AgentProfile service when given', () => {
    const doc = buildDidDocument({
      agentDid: 'did:web:kyber.agent',
      controllerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      endpoints: { didcomm: 'https://kyber.agent.arp.run/didcomm', agentCard: 'https://kyber.agent.arp.run/.well-known/agent-card.json' },
      representationVcUrl: 'https://kyber.agent.arp.run/representation.jwt',
      profileUrl: 'https://kyber.agent.arp.run/.well-known/agent-profile.json',
    });
    const svc = doc.service?.find((s) => s.type === 'AgentProfile');
    expect(svc?.serviceEndpoint).toBe('https://kyber.agent.arp.run/.well-known/agent-profile.json');
  });
});
