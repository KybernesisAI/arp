import type { Obligation } from '@kybernesis/arp-spec';

export type PdpDecision = {
  decision: 'allow' | 'deny';
  obligations: Obligation[];
  policies_fired: string[];
  reasons: string[];
};

export interface Entity {
  type: string;
  id: string;
  attrs?: Record<string, unknown>;
  parents?: Array<{ type: string; id: string }>;
}

export interface EvaluateInput {
  cedarPolicies: string[];
  obligationPolicies?: string[];
  principal: Entity;
  action: string;
  resource: Entity;
  context?: Record<string, unknown>;
  /** Extra entity records to hand to Cedar (parents, attribute lookups). */
  entities?: Entity[];
}

export interface Pdp {
  evaluate(input: EvaluateInput): PdpDecision;
}
