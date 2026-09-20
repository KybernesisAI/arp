/**
 * Is this agent online right now?
 *
 * Bridge agents hold a socket and stamp `last_seen_at` continuously. Push
 * agents stamp it only when a delivery succeeds, so between messages the
 * stamp goes stale even though the runtime is up. For a push agent with a
 * stale stamp we ask the runtime directly (its identity health endpoint,
 * short timeout) instead of reporting "offline" by default.
 */

export const ACTIVE_MS = 5 * 60 * 1000;

export interface LivenessInput {
  runtimeKind: 'none' | 'bridge' | 'push';
  pushKind?: 'eve' | 'generic' | null;
  pushUrl?: string | null;
  lastSeenAt?: Date | null;
}

export type Liveness = 'online' | 'offline' | 'identity_only';

export async function agentLiveness(agent: LivenessInput, opts: { fetchImpl?: typeof fetch; now?: number; timeoutMs?: number } = {}): Promise<Liveness> {
  if (agent.runtimeKind === 'none') return 'identity_only';
  const now = opts.now ?? Date.now();
  if (agent.lastSeenAt && now - agent.lastSeenAt.getTime() <= ACTIVE_MS) return 'online';
  if (agent.runtimeKind !== 'push' || !agent.pushUrl) return 'offline';
  const f = opts.fetchImpl ?? globalThis.fetch;
  const base = agent.pushUrl.replace(/\/+$/, '');
  const url = agent.pushKind === 'eve' ? `${base}/eve/v1/arp/health` : `${base}/.well-known/agentid-verification`;
  try {
    const res = await f(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 3_000), headers: { accept: 'application/json' }, cache: 'no-store' });
    return res.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}
