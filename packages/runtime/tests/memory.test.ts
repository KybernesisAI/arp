import { describe, expect, it } from 'vitest';
import { createConnectionMemory } from '../src/memory.js';

describe('createConnectionMemory', () => {
  it('partitions reads strictly by connection_id', () => {
    const mem = createConnectionMemory();
    mem.set('conn_A', 'secret', 'alpha');
    expect(mem.get('conn_B', 'secret')).toBeNull();
    expect(mem.get('conn_A', 'secret')).toBe('alpha');
  });

  it('returns null for unknown connections', () => {
    const mem = createConnectionMemory();
    expect(mem.get('conn_X', 'k')).toBeNull();
    expect(mem.hasConnection('conn_X')).toBe(false);
  });

  it('clear drops the entire partition', () => {
    const mem = createConnectionMemory();
    mem.set('conn_A', 'k1', 1);
    mem.set('conn_A', 'k2', 2);
    mem.clear('conn_A');
    expect(mem.keys('conn_A')).toEqual([]);
    expect(mem.get('conn_A', 'k1')).toBeNull();
  });
});
