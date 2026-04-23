/**
 * Session registry — tracks active outbound WS connections per agent_did.
 *
 * Lives in-process. In production a single process serves WS; under a
 * multi-node cloud deployment you'd replace this with a Redis pub/sub
 * broker. v0 ships the in-process registry and defers the broker to v0.2
 * (tracked on the Phase-9 cleanup list).
 */

import type { AgentSessionHandle } from './types.js';

export interface SessionRegistry {
  add(handle: AgentSessionHandle): void;
  remove(sessionId: string): void;
  getByAgent(agentDid: string): AgentSessionHandle | null;
  getBySession(sessionId: string): AgentSessionHandle | null;
  listByTenant(tenantId: string): AgentSessionHandle[];
  size(): number;
}

export function createSessionRegistry(): SessionRegistry {
  const bySession = new Map<string, AgentSessionHandle>();
  const byAgent = new Map<string, AgentSessionHandle>();

  return {
    add(handle) {
      // Replace any existing session for the same agent — last connection wins.
      const prev = byAgent.get(handle.did);
      if (prev && prev.sessionId !== handle.sessionId) {
        void prev.close(4000, 'superseded');
        bySession.delete(prev.sessionId);
      }
      byAgent.set(handle.did, handle);
      bySession.set(handle.sessionId, handle);
    },
    remove(sessionId) {
      const handle = bySession.get(sessionId);
      if (!handle) return;
      bySession.delete(sessionId);
      // Only drop the byAgent index if it still points at this session.
      const current = byAgent.get(handle.did);
      if (current && current.sessionId === sessionId) {
        byAgent.delete(handle.did);
      }
    },
    getByAgent(agentDid) {
      const h = byAgent.get(agentDid);
      return h && h.isOpen() ? h : null;
    },
    getBySession(sessionId) {
      const h = bySession.get(sessionId);
      return h && h.isOpen() ? h : null;
    },
    listByTenant(tenantId) {
      const out: AgentSessionHandle[] = [];
      for (const h of byAgent.values()) {
        if (h.tenantId === tenantId && h.isOpen()) out.push(h);
      }
      return out;
    },
    size() {
      return bySession.size;
    },
  };
}
