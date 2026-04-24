import type * as React from 'react';
import { redirect } from 'next/navigation';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { listCredentialsForTenant } from '@/lib/webauthn';
import { Code, PlateHead } from '@/components/ui';
import { AppShell } from '@/components/app/AppShell';
import { SettingsSections } from './SettingsSections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SettingsPage(): Promise<React.JSX.Element> {
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState();
  } catch (err) {
    if (err instanceof AuthError) redirect('/onboarding');
    throw err;
  }
  const { tenant, credentials } = state;

  return (
    <AppShell>
      <PlateHead
        plateNum="D.01"
        kicker={`// SETTINGS · ${tenant.plan.toUpperCase()}`}
        title="Account settings"
      />

      <div className="grid grid-cols-12 gap-4 mb-10">
        <div className="col-span-12 md:col-span-8">
          <div className="font-mono text-kicker uppercase text-muted">// PRINCIPAL</div>
          <Code className="mt-2 text-[13px] break-all">{tenant.principalDid}</Code>
        </div>
      </div>

      <SettingsSections
        credentials={credentials}
        currentPrincipalDid={tenant.principalDid}
        hasPreviousDid={tenant.principalDidPrevious !== null}
        v1DeprecatedAt={tenant.v1DeprecatedAt}
      />
    </AppShell>
  );
}

async function loadState() {
  const { tenantDb } = await requireTenantDb();
  const tenant = await tenantDb.getTenant();
  if (!tenant) throw new AuthError(404, 'no_tenant');
  const credentials = await listCredentialsForTenant(tenantDb.tenantId);
  return {
    tenant: {
      principalDid: tenant.principalDid,
      plan: tenant.plan,
      principalDidPrevious: tenant.principalDidPrevious ?? null,
      v1DeprecatedAt: tenant.v1DeprecatedAt
        ? tenant.v1DeprecatedAt.toISOString()
        : null,
    },
    credentials: credentials.map((c) => ({
      id: c.id,
      nickname: c.nickname,
      createdAt: c.createdAt.toISOString(),
      lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
    })),
  };
}
