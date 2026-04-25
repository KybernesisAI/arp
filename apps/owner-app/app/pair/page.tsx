import { redirect } from 'next/navigation';
import { OwnerAppShell } from '@/components/OwnerAppShell';
import { getSession } from '@/lib/session';
import { env } from '@/lib/env';
import { getScopeCatalog } from '@/lib/catalog';
import { BUNDLES } from '@kybernesis/arp-scope-catalog';
import { PairForm } from './PairForm';

export const dynamic = 'force-dynamic';

export default async function PairPage() {
  if (!(await getSession())) redirect('/login');
  const e = env();
  const catalog = getScopeCatalog();
  const scopeIds = catalog.map((s) => ({
    id: s.id,
    label: s.label,
    risk: s.risk,
  }));
  const bundles = BUNDLES.map((b) => ({
    id: b.id,
    label: b.label,
    description: b.description,
    scopes: b.scopes,
  }));

  return (
    <OwnerAppShell>
      <h2 className="mb-4 font-display text-h3 font-medium text-ink">New connection</h2>
      <PairForm
        subjectDid={e.ARP_AGENT_DID}
        principalDid={e.ARP_PRINCIPAL_DID}
        scopeCatalogVersion={e.ARP_SCOPE_CATALOG_VERSION}
        ownerAppBaseUrl={e.ARP_OWNER_APP_BASE_URL}
        scopes={scopeIds}
        bundles={bundles}
      />
    </OwnerAppShell>
  );
}
