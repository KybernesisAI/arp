/**
 * AgentID S4: gateway-side credential lookup. The agent-API bearer is a random
 * token whose SHA-256 hash is stored in `agent_credentials`; this resolves it
 * to the (tenant, agent) it belongs to. Cross-tenant by design — the bearer
 * itself is the tenant selector.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { agentCredentials } from './schema.js';
import type { AgentCredentialRow } from './schema.js';
import type { CloudDbClient } from './db.js';

export async function findAgentCredentialByHash(
  client: CloudDbClient,
  tokenHash: string,
): Promise<AgentCredentialRow | null> {
  const rows = await client
    .select()
    .from(agentCredentials)
    .where(and(eq(agentCredentials.tokenHash, tokenHash), isNull(agentCredentials.revokedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function touchAgentCredential(client: CloudDbClient, id: string): Promise<void> {
  await client.update(agentCredentials).set({ lastUsedAt: sql`now()` }).where(eq(agentCredentials.id, id));
}
