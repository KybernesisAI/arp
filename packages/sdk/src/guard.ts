/**
 * Lightweight helper used by every framework adapter.
 *
 * Wraps one framework-specific tool/action with ARP's check → run → egress
 * pipeline. Keeps the per-adapter code tiny (≤ 30 lines of glue in most
 * cases) and ensures every adapter applies obligations consistently.
 *
 *   const result = await guardAction(agent, {
 *     connectionId,
 *     action: 'search',
 *     resource: { type: 'Tool', id: 'search' },
 *     context: { args },
 *     run: () => searchTool(args),
 *   });
 *   if (!result.allow) return { error: result.reason };
 *   return result.data;
 */

import type { ArpAgent } from './agent.js';
import type { Obligation, PdpDecision, Resource } from './types.js';

export interface GuardActionInput<T> {
  connectionId: string;
  action: string;
  resource: Resource;
  context?: Record<string, unknown>;
  /** The real framework call. Invoked only when the PDP allows. */
  run: () => Promise<T> | T;
  /**
   * When true (default), audit the decision via `agent.audit()`. Adapter
   * authors can turn this off when the framework already emits its own log.
   */
  audit?: boolean;
}

export type GuardActionResult<T> =
  | { allow: true; data: T; obligations: Obligation[]; decision: PdpDecision }
  | { allow: false; reason: string; decision: PdpDecision };

export async function guardAction<T>(
  agent: ArpAgent,
  input: GuardActionInput<T>,
): Promise<GuardActionResult<T>> {
  const decision = await agent.check({
    action: input.action,
    resource: input.resource,
    ...(input.context !== undefined ? { context: input.context } : {}),
    connectionId: input.connectionId,
  });

  const shouldAudit = input.audit !== false;

  if (decision.decision !== 'allow') {
    if (shouldAudit) {
      await agent.audit({
        connectionId: input.connectionId,
        decision: 'deny',
        reason: decision.reasons.join('; ') || 'policy_denied',
        policiesFired: decision.policies_fired,
      });
    }
    return {
      allow: false,
      reason: decision.reasons.join('; ') || 'policy_denied',
      decision,
    };
  }

  const raw = await input.run();
  const filtered = (await agent.egress({
    data: raw,
    connectionId: input.connectionId,
    obligations: decision.obligations,
  })) as T;

  if (shouldAudit) {
    await agent.audit({
      connectionId: input.connectionId,
      decision: 'allow',
      policiesFired: decision.policies_fired,
      ...(decision.obligations.length > 0
        ? { obligations: decision.obligations }
        : {}),
    });
  }

  return {
    allow: true,
    data: filtered,
    obligations: decision.obligations,
    decision,
  };
}
