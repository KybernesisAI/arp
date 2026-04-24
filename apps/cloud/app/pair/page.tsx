import type * as React from 'react';
import { redirect } from 'next/navigation';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { BUNDLES } from '@kybernesis/arp-scope-catalog';
import { getScopeCatalog } from '@/lib/catalog';
import {
  Badge,
  Code,
  PlateHead,
} from '@/components/ui';
import { AppShell } from '@/components/app/AppShell';
import { PairForm } from './PairForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /pair — create a new pairing invitation.
 *
 * Server component: collects the tenant's agents + the scope catalog + the
 * available bundles, then hands them to the `PairForm` client component
 * which handles:
 *   - browser-held did:key signing via `getOrCreatePrincipalKey()`;
 *   - POST to /api/pairing/invitations;
 *   - rendering the fragment-bearing share URL + copy-to-clipboard.
 */
export default async function PairPage(): Promise<React.JSX.Element> {
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState();
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  const { agents, catalog, bundles, principalDid } = state;

  return (
    <AppShell>
      <PlateHead
        plateNum="P.01"
        kicker="// NEW CONNECTION · OUT-OF-BAND INVITE"
        title="Pair with another agent"
      />

      <div className="mb-8 max-w-2xl text-body text-ink-2">
        <p>
          Generate a signed invitation, then share the URL with the peer. The
          signed payload rides in the URL fragment (<Code>#</Code>) so it
          never appears in server logs — only the browser that opens the
          link ever sees it.
        </p>
      </div>

      {agents.length === 0 ? (
        <div className="border border-rule bg-paper p-7 max-w-2xl">
          <Badge tone="yellow" className="mb-3">NO AGENTS</Badge>
          <p className="text-body">
            Provision an agent first — pairing always happens under one of
            your agents.
          </p>
        </div>
      ) : (
        <PairForm
          principalDid={principalDid}
          agents={agents}
          scopes={catalog.map((s) => ({ id: s.id, label: s.label, risk: s.risk }))}
          bundles={bundles}
        />
      )}
    </AppShell>
  );
}

async function loadState() {
  const { tenantDb, session } = await requireTenantDb();
  const agents = await tenantDb.listAgents();
  const catalog = getScopeCatalog();
  const bundles = BUNDLES.map((b) => ({
    id: b.id,
    label: b.label,
    description: b.description,
    scopes: b.scopes.map((s) => ({ id: s.id })),
  }));
  return {
    agents: agents.map((a) => ({ did: a.did, name: a.agentName })),
    catalog,
    bundles,
    principalDid: session.principalDid,
  };
}
