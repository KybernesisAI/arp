import { A2aAgentCardSchema, ARP_A2A_EXTENSION_URI, WELL_KNOWN_PATHS } from '@kybernesis/arp-spec';
import { verifyAgentCardSignature, type Jwk } from '@kybernesis/arp-transport';
import type { Probe, ProbeContext, ProbeResult } from '../types.js';
import { elapsed, now } from '../timing.js';
import { fetchJson } from '../http.js';

/**
 * AgentID S5: the identity's A2A v1.0 card at `/.well-known/agent-card.json`
 * validates, carries the ARP extension, advertises a JSON-RPC interface, and
 * its signature verifies against the JWKS its `jku` points at (or the
 * identity's `/.well-known/jwks.json`).
 */
export const a2aCardProbe: Probe = async (ctx: ProbeContext): Promise<ProbeResult> => {
  const startedAt = now();
  const base = ctx.baseUrl.replace(/\/$/, '');
  const failures: string[] = [];
  const warnings: string[] = [];
  const details: Record<string, unknown> & { warnings?: string[] } = {};

  const cardRes = await fetchJson(`${base}${WELL_KNOWN_PATHS.A2A_AGENT_CARD}`, ctx);
  details['status'] = cardRes.status;
  if (!cardRes.ok) {
    return fail(startedAt, details, `agent-card.json: HTTP ${cardRes.status}`);
  }
  const parsed = A2aAgentCardSchema.safeParse(cardRes.body);
  if (!parsed.success) {
    return fail(startedAt, details, `agent-card.json: ${parsed.error.issues[0]?.message ?? 'not a valid A2A card'}`);
  }
  const card = parsed.data;
  details['interfaces'] = card.supportedInterfaces.map((i) => `${i.protocolBinding} ${i.url}`);
  if (!card.supportedInterfaces.some((i) => i.protocolBinding === 'JSONRPC')) failures.push('no JSONRPC interface');
  const ext = card.capabilities.extensions?.find((e) => e.uri === ARP_A2A_EXTENSION_URI);
  if (!ext) failures.push(`missing ARP extension ${ARP_A2A_EXTENSION_URI}`);
  else details['arpExtension'] = ext.params ?? {};

  if (!card.signatures || card.signatures.length === 0) {
    warnings.push('card is unsigned');
  } else {
    let jku: string | null = null;
    try {
      const header = JSON.parse(Buffer.from(card.signatures[0]!.protected, 'base64url').toString('utf8')) as { jku?: string; kid?: string };
      jku = header.jku ?? null;
      details['kid'] = header.kid ?? null;
    } catch {
      failures.push('signature protected header is not JSON');
    }
    const jwksUrl = jku ?? `${base}${WELL_KNOWN_PATHS.JWKS}`;
    const jwksRes = await fetchJson(jwksUrl, ctx);
    if (!jwksRes.ok) failures.push(`jwks: HTTP ${jwksRes.status} at ${jwksUrl}`);
    else {
      const verdict = await verifyAgentCardSignature(card as Record<string, unknown>, jwksRes.body as { keys: Jwk[] });
      details['signature'] = verdict;
      if (!verdict.ok) failures.push(`signature: ${verdict.reason}`);
    }
  }

  if (warnings.length > 0) details.warnings = warnings;
  if (failures.length > 0) return fail(startedAt, details, failures.join('; '));
  return { name: 'a2a-card', pass: true, durationMs: elapsed(startedAt), details };
};

function fail(startedAt: number, details: Record<string, unknown>, message: string): ProbeResult {
  return { name: 'a2a-card', pass: false, durationMs: elapsed(startedAt), details, error: { code: 'a2a_card_invalid', message } };
}
