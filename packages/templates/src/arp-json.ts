import { ArpJsonSchema, ARP_VERSION, type ArpJson } from '@kybernesis/arp-spec';
import { validateOrThrow } from './util.js';

export interface BuildArpJsonInput {
  /** HTTPS origin of the agent (e.g. "https://samantha.agent"). */
  agentOrigin: string;
  /**
   * Override the advertised capabilities. Defaults to the v0 set:
   * didcomm-v2, cedar-pdp, ucan-tokens.
   */
  capabilities?: readonly string[];
  /** Override the scope-catalog URL (defaults to `<agentOrigin>/.well-known/scope-catalog.json`). */
  scopeCatalogUrl?: string;
  /** Override the policy-schema URL (defaults to `<agentOrigin>/.well-known/policy-schema.json`). */
  policySchemaUrl?: string;
}

const DEFAULT_CAPABILITIES = ['didcomm-v2', 'cedar-pdp', 'ucan-tokens'] as const;

export function buildArpJson(input: BuildArpJsonInput): ArpJson {
  const origin = input.agentOrigin.replace(/\/$/, '');
  const doc = {
    version: ARP_VERSION,
    capabilities: [...(input.capabilities ?? DEFAULT_CAPABILITIES)],
    scope_catalog_url:
      input.scopeCatalogUrl ?? `${origin}/.well-known/scope-catalog.json`,
    policy_schema_url:
      input.policySchemaUrl ?? `${origin}/.well-known/policy-schema.json`,
  };
  return validateOrThrow('buildArpJson', ArpJsonSchema, doc);
}
