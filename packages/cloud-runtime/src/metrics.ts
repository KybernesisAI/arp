/**
 * Metrics collector. Two implementations:
 *   - default: in-memory counters (used in dev + tests)
 *   - log-based: emits each metric as a pino event (Vercel log drains → Axiom)
 *
 * Swap via `createLogBasedMetrics(logger)` in production.
 */

import type { CloudRuntimeLogger, TenantMetrics } from './types.js';

export interface InMemoryMetricsSnapshot {
  inboundByTenant: Map<string, number>;
  outboundByTenant: Map<string, number>;
  pdpLatencyByTenant: Map<string, number[]>;
  counters: Map<string, Map<string, number>>;
}

export interface InMemoryMetrics extends TenantMetrics {
  snapshot(): InMemoryMetricsSnapshot;
  reset(): void;
}

export function createInMemoryMetrics(): InMemoryMetrics {
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  const pdpLatency = new Map<string, number[]>();
  const counters = new Map<string, Map<string, number>>();

  function bump(map: Map<string, number>, key: string, by = 1): void {
    map.set(key, (map.get(key) ?? 0) + by);
  }

  return {
    inbound(tenantId) {
      bump(inbound, tenantId);
    },
    outbound(tenantId) {
      bump(outbound, tenantId);
    },
    pdpLatency(tenantId, ms) {
      const arr = pdpLatency.get(tenantId) ?? [];
      arr.push(ms);
      pdpLatency.set(tenantId, arr);
    },
    incr(name, tenantId, by = 1) {
      let sub = counters.get(name);
      if (!sub) {
        sub = new Map();
        counters.set(name, sub);
      }
      bump(sub, tenantId, by);
    },
    snapshot() {
      return { inboundByTenant: inbound, outboundByTenant: outbound, pdpLatencyByTenant: pdpLatency, counters };
    },
    reset() {
      inbound.clear();
      outbound.clear();
      pdpLatency.clear();
      counters.clear();
    },
  };
}

export function createLogBasedMetrics(logger: CloudRuntimeLogger): TenantMetrics {
  return {
    inbound(tenantId) {
      logger.info({ metric: 'arp.inbound', tenantId }, 'inbound');
    },
    outbound(tenantId) {
      logger.info({ metric: 'arp.outbound', tenantId }, 'outbound');
    },
    pdpLatency(tenantId, ms) {
      logger.info({ metric: 'arp.pdp_latency_ms', tenantId, ms }, 'pdp_latency');
    },
    incr(name, tenantId, by = 1) {
      logger.info({ metric: `arp.${name}`, tenantId, by }, name);
    },
  };
}
