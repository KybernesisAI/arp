import type * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AgentPage(props: {
  params: Promise<{ did: string }>;
}): Promise<React.JSX.Element> {
  const { did: rawDid } = await props.params;
  const did = decodeURIComponent(rawDid);
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState(did);
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  if (!state) {
    return (
      <main style={{ padding: '2rem' }}>
        <p>Agent not found.</p>
        <Link href="/dashboard">Back to dashboard</Link>
      </main>
    );
  }
  const { agent, connections } = state;
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <p>
        <Link href="/dashboard" style={{ color: '#60a5fa' }}>
          ← Dashboard
        </Link>
      </p>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{agent.name}</h1>
      <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
        <code>{agent.did}</code>
      </p>
      <section
        style={{ padding: '1.5rem', backgroundColor: '#1e293b', borderRadius: '0.5rem', border: '1px solid #334155' }}
      >
        <h2 style={{ marginTop: 0 }}>Connections ({connections.length})</h2>
        {connections.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>No active connections.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {connections.map((c) => (
              <li key={c.connectionId} style={{ padding: '0.75rem 0', borderTop: '1px solid #334155' }}>
                <strong>{c.connectionId}</strong> → {c.peerDid}
                <div style={{ color: '#94a3b8', fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                  status: {c.status} · purpose: {c.purpose ?? '(none)'} · created{' '}
                  {new Date(c.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

async function loadState(did: string) {
  const { tenantDb } = await requireTenantDb();
  const agent = await tenantDb.getAgent(did);
  if (!agent) return null;
  const connections = await tenantDb.listConnections({ agentDid: did });
  return {
    agent: { did: agent.did, name: agent.agentName },
    connections: connections.map((c) => ({
      connectionId: c.connectionId,
      peerDid: c.peerDid,
      purpose: c.purpose,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}
