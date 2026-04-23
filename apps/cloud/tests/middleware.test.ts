import { describe, it, expect } from 'vitest';
import { parseAgentDidFromHost } from '../middleware';

describe('parseAgentDidFromHost (HNS bridge)', () => {
  it('extracts DID from bare .agent host', () => {
    expect(parseAgentDidFromHost('samantha.agent')).toBe('did:web:samantha.agent');
  });
  it('extracts DID from owner subdomain', () => {
    expect(parseAgentDidFromHost('ian.samantha.agent')).toBe('did:web:samantha.agent');
  });
  it('extracts DID from hns.to gateway', () => {
    expect(parseAgentDidFromHost('samantha.agent.hns.to')).toBe('did:web:samantha.agent');
    expect(parseAgentDidFromHost('ian.samantha.agent.hns.to')).toBe('did:web:samantha.agent');
  });
  it('strips port', () => {
    expect(parseAgentDidFromHost('samantha.agent:8080')).toBe('did:web:samantha.agent');
  });
  it('returns null for non-.agent hosts', () => {
    expect(parseAgentDidFromHost('app.arp.spec')).toBeNull();
    expect(parseAgentDidFromHost('example.com')).toBeNull();
    expect(parseAgentDidFromHost('')).toBeNull();
    expect(parseAgentDidFromHost('localhost')).toBeNull();
  });
});
