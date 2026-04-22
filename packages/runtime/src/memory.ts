/**
 * Per-connection memory partitioning — the isolation boundary the reference
 * agent uses to prove data can't leak across connections.
 *
 * v0 is an in-memory Map-of-Maps. Phase 5+ can swap for a persistent backend
 * while keeping the interface intact.
 */

export interface ConnectionMemory {
  set(connectionId: string, key: string, value: unknown): void;
  get(connectionId: string, key: string): unknown | null;
  delete(connectionId: string, key: string): boolean;
  clear(connectionId: string): void;
  keys(connectionId: string): string[];
  hasConnection(connectionId: string): boolean;
}

export function createConnectionMemory(): ConnectionMemory {
  const store = new Map<string, Map<string, unknown>>();

  function bucket(id: string): Map<string, unknown> {
    let b = store.get(id);
    if (!b) {
      b = new Map();
      store.set(id, b);
    }
    return b;
  }

  return {
    set(connectionId, key, value) {
      bucket(connectionId).set(key, value);
    },
    get(connectionId, key) {
      const b = store.get(connectionId);
      return b?.has(key) ? b.get(key) : null;
    },
    delete(connectionId, key) {
      return store.get(connectionId)?.delete(key) ?? false;
    },
    clear(connectionId) {
      store.delete(connectionId);
    },
    keys(connectionId) {
      return Array.from(store.get(connectionId)?.keys() ?? []);
    },
    hasConnection(connectionId) {
      return store.has(connectionId);
    },
  };
}
