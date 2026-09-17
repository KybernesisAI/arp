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
  it('routes the ICANN mirror host when a suffix is configured', () => {
    expect(agentDidFromHost('samantha.agent.arp.run', '.agent.arp.run')).toBe('did:web:samantha.agent');
    expect(agentDidFromHost('samantha.agent.arp.run', '.arp.run')).toBe('did:web:samantha.agent');
    expect(agentDidFromHost('SAMANTHA.AGENT.ARP.RUN:443', 'agent.arp.run')).toBe('did:web:samantha.agent');
    expect(agentDidFromHost('ian.samantha.agent.arp.run', '.agent.arp.run')).toBe('did:web:samantha.agent');
  });
  it('does not treat the bare suffix host or unrelated hosts as agents', () => {
    expect(agentDidFromHost('agent.arp.run', '.agent.arp.run')).toBeNull();
    expect(agentDidFromHost('arp.run', '.agent.arp.run')).toBeNull();
    expect(agentDidFromHost('samantha.agent.arp.run', null)).toBeNull();
    expect(agentDidFromHost('samantha.agent.example.com', '.agent.arp.run')).toBeNull();
  });
});
