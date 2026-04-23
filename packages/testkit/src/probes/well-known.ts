import {
  AgentCardSchema,
  ArpJsonSchema,
  DidDocumentSchema,
} from '@kybernesis/arp-spec';
import type { Probe, ProbeContext, ProbeResult } from '../types.js';
import { elapsed, now } from '../timing.js';
import { fetchJson } from '../http.js';

/**
 * Well-known probe — verifies that the three public documents required for
 * ARP discovery are served with the correct `Content-Type` and validate
 * against the published Zod schemas (which mirror the JSON schemas shipped
 * by `@kybernesis/arp-spec`).
 */
export const wellKnownProbe: Probe = async (ctx: ProbeContext): Promise<ProbeResult> => {
  const startedAt = now();
  const base = ctx.baseUrl.replace(/\/$/, '');
  const urls = {
    did: `${base}/.well-known/did.json`,
    agentCard: `${base}/.well-known/agent-card.json`,
    arp: `${base}/.well-known/arp.json`,
  } as const;

  const failures: string[] = [];
  const results: Record<string, { status: number; contentType: string | null }> = {};

  const didRes = await fetchJson(urls.did, ctx);
  results['did.json'] = { status: didRes.status, contentType: didRes.contentType };
  if (!didRes.ok) failures.push(`did.json: HTTP ${didRes.status}`);
  else if (!isJsonContentType(didRes.contentType)) {
    failures.push(`did.json: content-type "${didRes.contentType ?? ''}" is not JSON`);
  } else {
    const parsed = DidDocumentSchema.safeParse(didRes.body);
    if (!parsed.success)
      failures.push(`did.json: ${parsed.error.issues[0]?.message ?? 'schema invalid'}`);
  }

  const agentCardRes = await fetchJson(urls.agentCard, ctx);
  results['agent-card.json'] = {
    status: agentCardRes.status,
    contentType: agentCardRes.contentType,
  };
  if (!agentCardRes.ok) failures.push(`agent-card.json: HTTP ${agentCardRes.status}`);
  else if (!isJsonContentType(agentCardRes.contentType)) {
    failures.push(`agent-card.json: content-type "${agentCardRes.contentType ?? ''}" is not JSON`);
  } else {
    const parsed = AgentCardSchema.safeParse(agentCardRes.body);
    if (!parsed.success)
      failures.push(`agent-card.json: ${parsed.error.issues[0]?.message ?? 'schema invalid'}`);
  }

  const arpRes = await fetchJson(urls.arp, ctx);
  results['arp.json'] = { status: arpRes.status, contentType: arpRes.contentType };
  if (!arpRes.ok) failures.push(`arp.json: HTTP ${arpRes.status}`);
  else if (!isJsonContentType(arpRes.contentType)) {
    failures.push(`arp.json: content-type "${arpRes.contentType ?? ''}" is not JSON`);
  } else {
    const parsed = ArpJsonSchema.safeParse(arpRes.body);
    if (!parsed.success)
      failures.push(`arp.json: ${parsed.error.issues[0]?.message ?? 'schema invalid'}`);
  }

  const pass = failures.length === 0;
  return {
    name: 'well-known',
    pass,
    durationMs: elapsed(startedAt),
    details: {
      urls,
      results,
      ...(failures.length > 0 ? { failures } : {}),
    },
    ...(pass
      ? {}
      : {
          error: {
            code: 'well_known_invalid',
            message: failures.join('; '),
          },
        }),
  };
};

function isJsonContentType(ct: string | null): boolean {
  if (!ct) return false;
  return /application\/json/i.test(ct);
}
