import type { Probe, ProbeContext, ProbeResult } from '../types.js';
import { elapsed, now } from '../timing.js';

/**
 * Cross-connection isolation probe.
 *
 * The canonical Phase-5 isolation check: with two connections A and B to the
 * same peer, data set under connection A must NEVER be observable under
 * connection B — for any of the 10 memory categories.
 *
 * This probe is driven by the phase-5 acceptance test-harness (which owns
 * two runtimes in-process and a dispatch handler that reads/writes the
 * per-connection memory). The testkit surface exposes a helper that a
 * caller can plug into programmatically; the default async probe simply
 * skips at audit time because it can't inspect another agent's memory
 * through the public wire API.
 */
export interface CrossConnectionIsolationResult {
  category: string;
  connectionAKey: string;
  connectionBKey: string;
  valueSetA: unknown;
  observedInB: unknown;
  leaked: boolean;
}

export interface CrossConnectionProbeOptions {
  /** Async driver that exercises one category end-to-end and returns what B saw. */
  driver: (category: string, secret: unknown) => Promise<{
    aAccepted: boolean;
    bResponseContains: unknown;
  }>;
  /** Categories to exercise. Defaults to the Phase-5 10-category list. */
  categories?: readonly string[];
  /** How many runs per category. Defaults to 1 (tests bump to 100). */
  runsPerCategory?: number;
  /** Supply a deterministic test secret per category + run. */
  makeSecret?: (category: string, run: number) => unknown;
}

export const DEFAULT_MEMORY_CATEGORIES: readonly string[] = [
  'facts',
  'preferences',
  'documents',
  'contacts',
  'events',
  'tasks',
  'emails',
  'messages',
  'credentials',
  'notes',
];

export function createCrossConnectionProbe(opts: CrossConnectionProbeOptions): Probe {
  return async (_ctx: ProbeContext): Promise<ProbeResult> => {
    const startedAt = now();
    const categories = opts.categories ?? DEFAULT_MEMORY_CATEGORIES;
    const runsPerCategory = opts.runsPerCategory ?? 1;
    const makeSecret =
      opts.makeSecret ?? ((cat: string, run: number) => `secret:${cat}:${run}`);
    const leaks: CrossConnectionIsolationResult[] = [];

    for (const category of categories) {
      for (let run = 0; run < runsPerCategory; run++) {
        const secret = makeSecret(category, run);
        try {
          const { aAccepted, bResponseContains } = await opts.driver(category, secret);
          const leaked = containsSecret(bResponseContains, secret);
          if (!aAccepted) {
            leaks.push({
              category,
              connectionAKey: `${category}-A`,
              connectionBKey: `${category}-B`,
              valueSetA: secret,
              observedInB: bResponseContains,
              leaked: true,
            });
          } else if (leaked) {
            leaks.push({
              category,
              connectionAKey: `${category}-A`,
              connectionBKey: `${category}-B`,
              valueSetA: secret,
              observedInB: bResponseContains,
              leaked: true,
            });
          }
        } catch (err) {
          return {
            name: 'cross-connection',
            pass: false,
            durationMs: elapsed(startedAt),
            details: { category, run },
            error: { code: 'driver_error', message: (err as Error).message },
          };
        }
      }
    }

    const pass = leaks.length === 0;
    return {
      name: 'cross-connection',
      pass,
      durationMs: elapsed(startedAt),
      details: {
        categories_tested: categories.length,
        runs_per_category: runsPerCategory,
        total_runs: categories.length * runsPerCategory,
        leaks_count: leaks.length,
        ...(leaks.length > 0 ? { leaks: leaks.slice(0, 20) } : {}),
      },
      ...(pass
        ? {}
        : {
            error: {
              code: 'cross_connection_leak',
              message: `${leaks.length} leak(s) detected across ${categories.length} categories`,
            },
          }),
    };
  };
}

export const crossConnectionProbe: Probe = async (ctx: ProbeContext): Promise<ProbeResult> => {
  return {
    name: 'cross-connection',
    pass: true,
    durationMs: 0,
    skipped: true,
    skipReason:
      'cross-connection isolation probe needs a programmatic driver; use createCrossConnectionProbe()',
    details: { target: ctx.target },
  };
};

function containsSecret(observed: unknown, secret: unknown): boolean {
  const s = typeof secret === 'string' ? secret : JSON.stringify(secret);
  if (observed === null || observed === undefined) return false;
  if (typeof observed === 'string') return observed.includes(s);
  try {
    return JSON.stringify(observed).includes(s);
  } catch {
    return false;
  }
}
