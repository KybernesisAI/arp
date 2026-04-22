import type { Obligation } from '@kybernesis/arp-spec';
import {
  assertSchemaParses,
  buildCedarCall,
  cedarIsAuthorized,
} from './cedar.js';
import { parseObligationPolicy, obligationRecord } from './obligations.js';
import type { Pdp, PdpDecision } from './types.js';

/**
 * Build a PDP bound to a Cedar schema. The schema is parsed eagerly so
 * malformed schemas fail at construction rather than on first evaluation.
 *
 * v0 does NOT enforce the schema at request time — `isAuthorized` is called
 * without `enableRequestValidation`, mirroring the posture in Phase 2. Phase
 * 5 can turn validation on once all reference agents' contexts conform.
 */
export function createPdp(schemaJson: string): Pdp {
  assertSchemaParses(schemaJson);

  return {
    evaluate(input): PdpDecision {
      // Concatenate all permit/forbid entries into a single policy-set string.
      // Each entry may contain multiple Cedar policies (e.g. a permit + a
      // sibling forbid). Cedar auto-generates IDs (`policy0`, `policy1`, ...)
      // which surface in diagnostics.reason; we return those as
      // `policies_fired`.
      const joined = input.cedarPolicies
        .map((text) => text.trim())
        .filter((t) => t.length > 0)
        .join('\n');

      const decisionCall = buildCedarCall({
        policies: joined,
        principal: input.principal,
        action: input.action,
        resource: input.resource,
        context: input.context ?? {},
        entities: input.entities ?? [],
      });
      const decisionAnswer = cedarIsAuthorized(decisionCall);
      if (decisionAnswer.type !== 'success') {
        throw new Error(
          `Cedar authorization failed: ${JSON.stringify(decisionAnswer.errors)}`,
        );
      }
      const rawDecision = decisionAnswer.response.decision;
      const decision: 'allow' | 'deny' = rawDecision === 'Allow' ? 'allow' : 'deny';

      const firedDecisionPolicies = toStringArray(decisionAnswer.response.diagnostics.reason);
      const reasons = decisionAnswer.response.diagnostics.errors.map(
        (e) => e.error.message,
      );

      const obligations: Obligation[] = [];
      const obligationFired: string[] = [];
      if (decision === 'allow' && input.obligationPolicies?.length) {
        const parsed = input.obligationPolicies.map((text, idx) =>
          parseObligationPolicy(text, `o_${idx}`),
        );
        const obligationMap: Record<string, string> = {};
        for (const p of parsed) obligationMap[p.id] = p.cleanedText;

        const obligationCall = buildCedarCall({
          policies: obligationMap,
          principal: input.principal,
          action: input.action,
          resource: input.resource,
          context: input.context ?? {},
          entities: input.entities ?? [],
        });
        const obligationAnswer = cedarIsAuthorized(obligationCall);
        if (obligationAnswer.type !== 'success') {
          throw new Error(
            `Cedar obligation evaluation failed: ${JSON.stringify(obligationAnswer.errors)}`,
          );
        }
        const fired = new Set(
          toStringArray(obligationAnswer.response.diagnostics.reason),
        );
        for (const p of parsed) {
          if (fired.has(p.id)) {
            obligations.push(obligationRecord(p));
            obligationFired.push(p.id);
          }
        }
      }

      return {
        decision,
        obligations,
        policies_fired: [...firedDecisionPolicies, ...obligationFired],
        reasons,
      };
    },
  };
}

function toStringArray(value: unknown): string[] {
  // cedar-wasm types `reason` as `Set<String>` at the TS layer but returns a
  // plain array at runtime. Defensive normalise — treat either as iterable.
  if (Array.isArray(value)) {
    return value.map((v) => String(v));
  }
  if (value && typeof value === 'object' && Symbol.iterator in value) {
    return Array.from(value as Iterable<unknown>).map((v) => String(v));
  }
  return [];
}

