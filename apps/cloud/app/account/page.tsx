import type * as React from 'react';
import { redirect } from 'next/navigation';
import { ConsoleShell } from '@/components/app/ConsoleShell';
import { ConsoleHead } from '@/components/app/ConsoleHead';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { listCredentialsForTenant } from '@/lib/webauthn';
import { SettingsSections } from '@/app/dashboard/settings/SettingsSections';
import { AccountPanel } from './AccountPanel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /account — the owner's own account (AgentID S6d): the name shown as owner,
 * the email used to sign in from any device, the passkeys on this device,
 * the recovery phrase, and sign out. Every .agent name on the dashboard is
 * registered to this account.
 */
export default async function AccountPage(): Promise<React.JSX.Element> {
  let state: Awaited<ReturnType<typeof loadState>>;
  try {
    state = await loadState();
  } catch (err) {
    if (err instanceof AuthError) redirect('/cloud/login?next=/account');
    throw err;
  }
  const { tenant, credentials } = state;
  return (
    <ConsoleShell active="account">
      <ConsoleHead kicker="Account" title={tenant.displayName ? `${tenant.displayName}.` : 'Your account.'} />
      <p className="-mt-6 mb-8 max-w-[60ch] text-[16px] text-zinc-600">
        One account owns all your names. Your key stays in this browser; add an email so you can sign in from any device, and keep the recovery phrase somewhere safe.
      </p>
      <AccountPanel initialName={tenant.displayName} initialEmail={tenant.email} emailVerified={tenant.emailVerified} agentCount={tenant.agentCount} plan={tenant.plan} />
      <div className="mt-14">
        <SettingsSections credentials={credentials} currentPrincipalDid={tenant.principalDid} hasPreviousDid={tenant.principalDidPrevious !== null} v1DeprecatedAt={tenant.v1DeprecatedAt} />
      </div>
    </ConsoleShell>
  );
}

async function loadState() {
  const { tenantDb } = await requireTenantDb();
  const tenant = await tenantDb.getTenant();
  if (!tenant) throw new AuthError(404, 'no_tenant');
  const [credentials, agents] = await Promise.all([listCredentialsForTenant(tenantDb.tenantId), tenantDb.listAgents()]);
  return {
    tenant: {
      displayName: tenant.displayName ?? null,
      email: tenant.email ?? null,
      emailVerified: tenant.emailVerifiedAt !== null,
      plan: tenant.plan,
      agentCount: agents.length,
      principalDid: tenant.principalDid,
      principalDidPrevious: tenant.principalDidPrevious ?? null,
      v1DeprecatedAt: tenant.v1DeprecatedAt ? tenant.v1DeprecatedAt.toISOString() : null,
    },
    credentials: credentials.map((c) => ({ id: c.id, nickname: c.nickname, createdAt: c.createdAt.toISOString(), lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null })),
  };
}
