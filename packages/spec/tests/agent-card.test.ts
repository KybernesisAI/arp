import { describe, it, expect } from 'vitest';
import { AgentCardSchema } from '../src/index.js';
import { VALID_AGENT_CARD, clone } from './fixtures.js';

describe('AgentCardSchema', () => {
  it('accepts the reference card', () => {
    expect(AgentCardSchema.safeParse(VALID_AGENT_CARD).success).toBe(true);
  });

  it('rejects empty accepted_protocols', () => {
    const bad = clone(VALID_AGENT_CARD);
    bad.accepted_protocols = [];
    expect(AgentCardSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects policy engines other than cedar', () => {
    const bad = clone(VALID_AGENT_CARD);
    (bad.policy as { engine: string }).engine = 'opa';
    expect(AgentCardSchema.safeParse(bad).success).toBe(false);
  });

  it('allows x402 disabled with empty currencies + null pricing_url', () => {
    expect(AgentCardSchema.safeParse(VALID_AGENT_CARD).success).toBe(true);
  });

  it('accepts x402 enabled with currencies + pricing URL', () => {
    const ok = clone(VALID_AGENT_CARD);
    ok.payment = {
      x402_enabled: true,
      currencies: ['USDC'],
      pricing_url: 'https://samantha.agent/pricing',
    };
    expect(AgentCardSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects non-URL didcomm endpoint', () => {
    const bad = clone(VALID_AGENT_CARD);
    (bad.endpoints as { didcomm: string }).didcomm = 'samantha.agent/didcomm';
    expect(AgentCardSchema.safeParse(bad).success).toBe(false);
  });
});
