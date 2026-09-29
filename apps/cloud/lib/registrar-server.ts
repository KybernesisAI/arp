/**
 * Server-side glue for the registrar flows: resolves env-backed collaborators
 * (Headless client, Stripe, sealing key, tenant DB) and logs upstream detail
 * where customers never see it. Route handlers + the Stripe webhook call
 * these; the pure logic lives in `registrar.ts`.
 */

import type Stripe from 'stripe';
import { getBillingContext } from './billing';
import { env } from './env';
import { getHeadlessClient } from './headless';
import { sealingKey } from './key-custody';
import { posthog, track } from './posthog';
import { fulfilNameCheckout, type RegistrarEnv } from './registrar';
import { tenantDbById } from './tenant-context';
import { getDb } from './db';
import { nameClaimedEmail } from './email';
import { sendOnce } from './notify';
import { consoleUrl, profileUrl } from './origins';
import { applyNameSubscriptionChange, notifyConnectChanged, notifyPaymentFailed, recordNameRenewalPaid, type RenewalDeps } from './renewals';

export function registrarEnv(): RegistrarEnv {
  const e = env();
  return {
    AGENTID_NAME_PRICE_CENTS: e.AGENTID_NAME_PRICE_CENTS,
    AGENTID_NAME_MAX_YEARS: e.AGENTID_NAME_MAX_YEARS,
    AGENTID_MIRROR_SUFFIX: e.AGENTID_MIRROR_SUFFIX,
    STRIPE_PRICE_NAME_YEARLY: e.STRIPE_PRICE_NAME_YEARLY,
  };
}

export function headlessFromEnv() {
  return getHeadlessClient(env());
}

/** Stripe webhook hook: fulfil a completed name checkout for its tenant. */
export async function fulfilNameCheckoutFromWebhook(
  session: Stripe.Checkout.Session,
  tenantId: string,
): Promise<void> {
  const tenantDb = await tenantDbById(tenantId);
  const e = env();
  const outcome = await fulfilNameCheckout({
    tenantDb,
    session: {
      id: session.id,
      payment_intent: session.payment_intent as string | { id: string } | null,
      subscription: session.subscription as string | { id: string } | null,
      metadata: session.metadata ?? null,
    },
    headless: headlessFromEnv(),
    stripe: getBillingContext().stripe,
    sealKey: sealingKey({ ARP_CLOUD_KEY_ENCRYPTION_KEY: e.ARP_CLOUD_KEY_ENCRYPTION_KEY }),
    env: registrarEnv(),
  });

  const principal = session.metadata?.['principal_did'] ?? tenantId;
  if (outcome.outcome === 'registered') {
    const tenant = await tenantDb.getTenant();
    const sld = outcome.registration.sld;
    await sendOnce(await getDb(), { kind: 'name_claimed', ref: outcome.registration.id, to: tenant?.email ?? null, tenantId }, nameClaimedEmail({ domain: outcome.registration.domain, renewsOn: outcome.registration.expiryAt, nameUrl: consoleUrl(`/names/${sld}`), profileUrl: profileUrl(sld) }));
    track({
      distinctId: principal,
      event: 'agentid_name_registered',
      properties: {
        tenant_id: tenantId,
        domain: outcome.registration.domain,
        years: outcome.registration.years,
        agent_did: outcome.agentDid,
      },
    });
  } else if (outcome.outcome === 'failed') {
    console.error('[registrar] name fulfilment failed', {
      tenantId,
      registrationId: outcome.registration.id,
      detail: outcome.detail,
      refunded: outcome.refunded,
    });
    posthog.captureException(new Error(`name fulfilment failed: ${outcome.detail}`));
    track({
      distinctId: principal,
      event: 'agentid_name_failed',
      properties: {
        tenant_id: tenantId,
        domain: outcome.registration.domain,
        refunded: outcome.refunded,
        detail: outcome.detail,
      },
    });
  }
}

function renewalDeps(): RenewalDeps {
  return { opsEmail: env().OPS_EMAIL };
}

/** Stripe webhook hooks beyond the first checkout. */
export const billingWebhookHooks = {
  onNameCheckout: fulfilNameCheckoutFromWebhook,
  onNameRenewalPaid: async (input: { subscriptionId: string; tenantId: string; periodEnd: Date | null; invoiceId: string }) => {
    await recordNameRenewalPaid(await getDb(), input, renewalDeps());
  },
  onNameSubscriptionChanged: async (input: { subscriptionId: string; tenantId: string; autoRenew: boolean; periodEnd: Date | null }) => {
    await applyNameSubscriptionChange(await getDb(), input);
  },
  onPaymentFailed: async (input: { tenantId: string; subscriptionId: string | null; kind: string | null }) => {
    await notifyPaymentFailed(await getDb(), input, renewalDeps());
  },
  onConnectChanged: async (input: { tenantId: string; active: boolean }) => {
    await notifyConnectChanged(await getDb(), input, renewalDeps());
  },
};
