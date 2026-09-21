/**
 * Plain-language view of a connection for owners.
 *
 * A connection row stores Cedar policies (one per grant, per direction) and
 * obligations. Owners should never read Cedar or a `did:web:` string, so this
 * turns the row into: the two agents by name, what each one may do to the
 * other (scope labels from the catalog), and the conditions in words.
 */

import { getScopeCatalog } from '@/lib/catalog';

export interface ConnectionGrant {
  /** The agent that may act (plain name, e.g. `sid.agent`). */
  actorName: string;
  actorDid: string;
  /** What it may do, in the catalog's words. */
  may: string[];
}

export interface ConnectionView {
  connectionId: string;
  /** Your agent (the row's owner side) and the other agent. */
  mine: { did: string; name: string };
  peer: { did: string; name: string };
  purpose: string | null;
  status: string;
  grants: ConnectionGrant[];
  conditions: string[];
  createdAt: string;
  expiresAt: string | null;
  lastMessageAt: string | null;
  revokeReason: string | null;
}

/** `did:web:kyber.agent` → `kyber.agent`; other DIDs shortened. */
export function plainName(did: string): string {
  if (did.startsWith('did:web:')) return did.slice('did:web:'.length);
  return did.length > 28 ? `${did.slice(0, 16)}…${did.slice(-8)}` : did;
}

const POLICY_RE = /principal\s*==\s*Agent::"([^"]+)"[\s\S]*?action\s*==\s*Action::"([^"]+)"[\s\S]*?resource\s*(?:==|in)\s*([A-Za-z]+)::"([^"]*)"/;

let index: Map<string, string> | null = null;
/** (action verb, resource type) → scope label, from the catalog's Cedar templates. */
function labelIndex(): Map<string, string> {
  if (index) return index;
  index = new Map();
  for (const t of getScopeCatalog()) {
    const m = POLICY_RE.exec(t.cedar_template.replace('{{audience_did}}', 'x'));
    if (m) index.set(`${m[2]}|${m[3]}`, t.label);
  }
  return index;
}

/** One Cedar permit → who may do what, in words. */
export function describePolicy(policy: string): { actorDid: string; label: string } | null {
  const m = POLICY_RE.exec(policy);
  if (!m) return null;
  const [, actorDid, verb, type] = m;
  const label = labelIndex().get(`${verb}|${type}`) ?? `${verb!.replace(/_/g, ' ')} · ${type}`;
  return { actorDid: actorDid!, label };
}

export function describeObligation(ob: unknown): string {
  const o = (ob ?? {}) as { type?: string; params?: Record<string, unknown> };
  const p = o.params ?? {};
  switch (o.type) {
    case 'rate_limit':
      return `At most ${String(p['max'] ?? '?')} messages per ${String(p['window'] ?? 'period')}`;
    case 'redact_fields':
      return `Fields hidden from the other agent: ${Array.isArray(p['fields']) ? (p['fields'] as string[]).join(', ') : ''}`;
    case 'notify_principal':
      return 'You are notified each time this is used';
    case 'max_tokens':
      return `Answers capped at ${String(p['max'] ?? '?')} tokens`;
    case 'audit_only':
      return 'Every use is logged';
    default:
      return o.type ? o.type.replace(/_/g, ' ') : 'condition';
  }
}

export function buildConnectionView(row: {
  connectionId: string;
  agentDid: string;
  peerDid: string;
  purpose: string | null;
  status: string;
  cedarPolicies: unknown;
  obligations: unknown;
  createdAt: Date;
  expiresAt: Date | null;
  lastMessageAt: Date | null;
  revokeReason: string | null;
}, names: Map<string, string>): ConnectionView {
  const nameOf = (did: string) => names.get(did) ?? plainName(did);
  const policies = Array.isArray(row.cedarPolicies) ? (row.cedarPolicies as string[]) : [];
  const byActor = new Map<string, Set<string>>();
  for (const p of policies) {
    const d = describePolicy(p);
    if (!d) continue;
    if (!byActor.has(d.actorDid)) byActor.set(d.actorDid, new Set());
    byActor.get(d.actorDid)!.add(d.label);
  }
  const grants: ConnectionGrant[] = [...byActor.entries()].map(([actorDid, may]) => ({ actorDid, actorName: nameOf(actorDid), may: [...may] }));
  // Your agent's grants first (what the other may do to yours reads more naturally second).
  grants.sort((a, b) => (a.actorDid === row.agentDid ? 1 : 0) - (b.actorDid === row.agentDid ? 1 : 0));
  const obligations = Array.isArray(row.obligations) ? (row.obligations as unknown[]) : [];
  const conditions = [...new Set(obligations.map(describeObligation))];
  return {
    connectionId: row.connectionId,
    mine: { did: row.agentDid, name: nameOf(row.agentDid) },
    peer: { did: row.peerDid, name: nameOf(row.peerDid) },
    purpose: row.purpose,
    status: row.status,
    grants,
    conditions,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    revokeReason: row.revokeReason,
  };
}
