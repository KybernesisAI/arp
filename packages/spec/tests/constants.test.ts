import { describe, it, expect } from 'vitest';
import {
  ARP_VERSION,
  DID_URI_REGEX,
  PROTOCOL_RESERVED_NAMES,
  WELL_KNOWN_PATHS,
  SINGLE_DIGIT_HOLDBACKS,
  SINGLE_LETTER_HOLDBACKS,
} from '../src/index.js';

describe('constants', () => {
  it('pins protocol version to 0.1', () => {
    expect(ARP_VERSION).toBe('0.1');
  });

  it('DID_URI_REGEX matches did:web:samantha.agent', () => {
    expect(DID_URI_REGEX.test('did:web:samantha.agent')).toBe(true);
  });

  it('DID_URI_REGEX rejects uppercase methods', () => {
    expect(DID_URI_REGEX.test('did:WEB:samantha.agent')).toBe(false);
  });

  it('lists the §4.1 protocol-reserved names', () => {
    expect(PROTOCOL_RESERVED_NAMES).toContain('_arp');
    expect(PROTOCOL_RESERVED_NAMES).toContain('_didcomm');
  });

  it('exposes canonical well-known paths', () => {
    expect(WELL_KNOWN_PATHS.DID).toBe('/.well-known/did.json');
    expect(WELL_KNOWN_PATHS.AGENT_CARD).toBe('/.well-known/agent-card.json');
    expect(WELL_KNOWN_PATHS.ARP).toBe('/.well-known/arp.json');
  });

  it('generates complete holdback ranges', () => {
    expect(SINGLE_DIGIT_HOLDBACKS).toHaveLength(10);
    expect(SINGLE_LETTER_HOLDBACKS).toHaveLength(26);
    expect(SINGLE_LETTER_HOLDBACKS[0]).toBe('a');
    expect(SINGLE_LETTER_HOLDBACKS[25]).toBe('z');
  });
});
