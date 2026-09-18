import { describe, expect, it } from 'vitest';
import { A2aAgentCardSchema, ARP_A2A_EXTENSION_URI } from '@kybernesis/arp-spec';
import { buildA2aAgentCard } from '../src/a2a-agent-card.js';

describe('buildA2aAgentCard', () => {
  it('produces a schema-valid A2A v1.0 card with the ARP extension and the mirror JSON-RPC interface', () => {
    const card = buildA2aAgentCard({
      name: 'Samantha',
      description: "Ian's agent",
      did: 'did:web:samantha.agent',
      origin: 'https://samantha.agent.arp.run/',
      pairUrl: 'https://cloud.arp.run/pair?peer=did:web:samantha.agent',
      provider: { organization: 'ian', url: 'https://agent.arp.run/samantha' },
      scopes: ['calendar.availability.read'],
    });
    expect(() => A2aAgentCardSchema.parse(card)).not.toThrow();
    expect(card.supportedInterfaces[0]).toEqual({ url: 'https://samantha.agent.arp.run/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' });
    const ext = card.capabilities.extensions?.find((e) => e.uri === ARP_A2A_EXTENSION_URI);
    expect(ext?.required).toBe(true);
    expect(ext?.params).toMatchObject({
      did: 'did:web:samantha.agent',
      arpCard: 'https://samantha.agent.arp.run/.well-known/arp-card.json',
      didDocument: 'https://samantha.agent.arp.run/.well-known/did.json',
      pair: 'https://cloud.arp.run/pair?peer=did:web:samantha.agent',
      scopes: ['calendar.availability.read'],
    });
    expect(card.securitySchemes?.['arp']?.scheme).toBe('bearer');
    expect(card.skills.map((s) => s.id)).toEqual(['converse']);
    expect(card.protocolVersion).toBe('1.0');
    expect(card.signatures).toBeUndefined();
  });
});
