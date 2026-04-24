/**
 * no-selfxyz-prompt probe (v2.1 §6).
 *
 * Fetches the registrar's ARP-setup page and greps the HTML for
 * `self.xyz` / `selfxyz`. Warn-only: presence of the literal string
 * produces a WARNING (`warnings` array in details) but does NOT fail
 * the audit — registrar UX is outside the protocol's control. Absence
 * is a pass.
 *
 * Skips when:
 *   - `ctx.registrarSetupUrl` is unset
 *   - fetch fails (404, network error, timeout) — registrar UX may
 *     gate behind a cart / auth, so "can't reach" is not "wrong".
 */

import type { Probe, ProbeContext, ProbeResult } from '../types.js';
import { elapsed, now } from '../timing.js';
import { withTimeout } from '../timing.js';

const SELFXYZ_PATTERN = /self[._]?xyz/gi;

export function createNoSelfxyzPromptProbe(): Probe {
  return async (ctx: ProbeContext): Promise<ProbeResult> => {
    const startedAt = now();
    if (!ctx.registrarSetupUrl) {
      return skip(startedAt, 'no registrarSetupUrl in ProbeContext');
    }

    const fetchImpl = ctx.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) {
      return skip(startedAt, 'no fetch implementation available');
    }

    const timeoutMs = ctx.timeoutMs ?? 10_000;
    let body: string;
    try {
      const res = await withTimeout(
        fetchImpl(ctx.registrarSetupUrl, {
          headers: {
            accept: 'text/html,application/xhtml+xml',
            ...(ctx.extraHeaders ?? {}),
          },
        }),
        timeoutMs,
        `GET ${ctx.registrarSetupUrl}`,
      );
      if (!res.ok) {
        return skip(startedAt, `registrar page returned HTTP ${res.status}`);
      }
      body = await res.text();
    } catch (err) {
      return skip(startedAt, `registrar page unreachable: ${(err as Error).message}`);
    }

    const matches = [...body.matchAll(SELFXYZ_PATTERN)];
    const warnings: string[] = [];
    if (matches.length > 0) {
      warnings.push(
        `registrar page contains ${matches.length} Self.xyz mention(s); v2.1 §4 requires removal`,
      );
    }

    return {
      name: 'no-selfxyz-prompt',
      // Warn-only: pass=true even when matches found.
      pass: true,
      durationMs: elapsed(startedAt),
      details: {
        url: ctx.registrarSetupUrl,
        match_count: matches.length,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
    };
  };
}

export const noSelfxyzPromptProbe: Probe = createNoSelfxyzPromptProbe();

function skip(startedAt: number, reason: string): ProbeResult {
  return {
    name: 'no-selfxyz-prompt',
    pass: true,
    skipped: true,
    skipReason: reason,
    durationMs: elapsed(startedAt),
    details: { reason },
  };
}
