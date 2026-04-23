import { describe, it, expect } from 'vitest';
import { agentDidFromHost } from '../src/http.js';

describe('agentDidFromHost', () => {
  it('routes apex .agent hostnames', () => {
    expect(agentDidFromHost('samantha.agent')).toBe('did:web:samantha.agent');
  });
  it('routes owner subdomain', () => {
    expect(agentDidFromHost('ian.samantha.agent')).toBe('did:web:samantha.agent');
  });
  it('routes hns.to gateway', () => {
    expect(agentDidFromHost('samantha.agent.hns.to')).toBe('did:web:samantha.agent');
  });
  it('routes hns.to gateway with owner prefix', () => {
    expect(agentDidFromHost('ian.samantha.agent.hns.to')).toBe('did:web:samantha.agent');
  });
  it('strips port', () => {
    expect(agentDidFromHost('samantha.agent:8443')).toBe('did:web:samantha.agent');
  });
  it('returns null for non-.agent hosts', () => {
    expect(agentDidFromHost('example.com')).toBeNull();
    expect(agentDidFromHost('somewhere.else')).toBeNull();
  });
  it('returns null for bare hosts', () => {
    expect(agentDidFromHost('localhost')).toBeNull();
    expect(agentDidFromHost('')).toBeNull();
  });
});
