import { describe, it, expect } from 'vitest';
import { AgentCardSchema } from '@kybernesis/arp-spec';
import { buildAgentCard } from '../src/index.js';
import { seededRng, randomDidWeb, randomHttps, randomLabel } from './helpers.js';

describe('buildAgentCard', () => {
  it('produces a schema-valid card with defaults', () => {
    const card = buildAgentCard({
      name: 'Samantha',
      did: 'did:web:samantha.agent',
      endpoints: {
        didcomm: 'https://samantha.agent/didcomm',
        pairing: 'https://samantha.agent/pair',
      },
      agentOrigin: 'https://samantha.agent',
    });
    expect(AgentCardSchema.safeParse(card).success).toBe(true);
    expect(card.policy.schema).toBe('https://samantha.agent/.well-known/policy-schema.json');
    expect(card.payment.x402_enabled).toBe(false);
    expect(card.accepted_protocols).toContain('didcomm/v2');
  });

  it('threads custom policy schema URL through', () => {
    const card = buildAgentCard({
      name: 'Samantha',
      did: 'did:web:samantha.agent',
      endpoints: {
        didcomm: 'https://samantha.agent/didcomm',
        pairing: 'https://samantha.agent/pair',
      },
      policySchemaUrl: 'https://cdn.arp.spec/schema/policy-schema/v0.1.json',
    });
    expect(card.policy.schema).toBe('https://cdn.arp.spec/schema/policy-schema/v0.1.json');
  });

  it('throws if neither policySchemaUrl nor agentOrigin are given', () => {
    expect(() =>
      buildAgentCard({
        name: 'Samantha',
        did: 'did:web:samantha.agent',
        endpoints: {
          didcomm: 'https://samantha.agent/didcomm',
          pairing: 'https://samantha.agent/pair',
        },
      })
    ).toThrow(/policySchemaUrl or agentOrigin/);
  });

  it('includes x402 block with currencies when enabled', () => {
    const card = buildAgentCard({
      name: 'Samantha',
      did: 'did:web:samantha.agent',
      endpoints: {
        didcomm: 'https://samantha.agent/didcomm',
        pairing: 'https://samantha.agent/pair',
      },
      agentOrigin: 'https://samantha.agent',
      payment: { x402Enabled: true, currencies: ['USDC'] },
    });
    expect(card.payment.x402_enabled).toBe(true);
    expect(card.payment.currencies).toEqual(['USDC']);
  });

  const rng = seededRng(0xbad1d);
  for (let i = 0; i < 12; i += 1) {
    const agentDid = randomDidWeb(rng);
    const didcomm = randomHttps(rng, '/didcomm');
    const pairing = randomHttps(rng, '/pair');
    const agentOrigin = didcomm.replace(/\/didcomm$/, '');
    const name = randomLabel(rng);

    it(`property #${i + 1}: random valid inputs produce schema-valid cards`, () => {
      const card = buildAgentCard({
        name,
        did: agentDid,
        endpoints: { didcomm, pairing },
        agentOrigin,
      });
      expect(AgentCardSchema.safeParse(card).success).toBe(true);
    });
  }
});
