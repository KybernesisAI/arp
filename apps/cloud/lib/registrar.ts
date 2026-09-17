/**
 * Registrar-in-console orchestration (AgentID slice S2, tasks T4 + T5).
 *
 * Pure functions over injected collaborators so the whole purchase lifecycle
 * is unit-testable without HTTP, Stripe, or Headless:
 *
 *   searchName          availability + OUR price for a `.agent` name
 *   startNameCheckout   registration row (pending_payment) + Stripe Checkout
 *   fulfilNameCheckout  on `checkout.session.completed`: register at Headless,
 *                       mint the cloud-custody identity, or fail + refund
 *
 * State machine (domain_registrations.status):
 *   pending_payment → registering → registered → owner_pending → active
 *                                 ↘ failed (payment refunded)
 */

import type Stripe from 'stripe';
import type { DomainRegistrationRow, TenantDb } from '@kybernesis/arp-cloud-db';
import { HeadlessError, type HeadlessClient, normalizeSld, assertValidSld } from './headless';
import { mintIdentity, mirrorOriginFor } from './key-custody';

// ------------------------------------------------------------------ types

export interface RegistrarEnv {
  AGENTID_NAME_PRICE_CENTS: number;
  AGENTID_NAME_MAX_YEARS: number;
  AGENTID_MIRROR_SUFFIX: string;
}

/** The slice of Stripe we touch, typed structurally so tests can stub it. */
export interface StripeCheckoutLike {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<{ id: string; url: string | null }>;
    };
  };
}
export interface StripeRefundLike {
  refunds: {
    create(params: { payment_intent: string; reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent' }): Promise<unknown>;
  };
}

export const NAME_CHECKOUT_KIND = 'agentid_name';

export interface NameSearchResult {
  sld: string;
  domain: string;
  available: boolean;
  reason: string;
  /** Our retail price per year, cents. */
  priceCentsPerYear: number;
  maxYears: number;
}

export type RegistrarErrorCode =
  | 'invalid_sld'
  | 'reserved'
  | 'name_taken'
  | 'bad_years'
  | 'payments_not_configured'
  | 'registry_unavailable'
  | 'already_owned';

export class RegistrarError extends Error {
  readonly code: RegistrarErrorCode;
  readonly status: number;
  constructor(code: RegistrarErrorCode, message: string, status: number) {
    super(message);
    this.name = 'RegistrarError';
    this.code = code;
    this.status = status;
  }
}

function fromHeadless(err: unknown): never {
  if (err instanceof HeadlessError) {
    switch (err.code) {
      case 'invalid_sld':
        throw new RegistrarError('invalid_sld', err.message, 400);
      case 'reserved':
        throw new RegistrarError('reserved', err.message, 400);
      case 'name_taken':
        throw new RegistrarError('name_taken', err.message, 409);
      case 'rate_limited':
        throw new RegistrarError('registry_unavailable', 'Name lookup is busy. Try again in a moment.', 503);
      default:
        // Never leak upstream detail to the customer surface; the caller logs `err`.
        throw new RegistrarError('registry_unavailable', 'Name registry is temporarily unavailable.', 503);
    }
  }
  throw err;
}

// ------------------------------------------------------------------ search

export async function searchName(input: {
  query: string;
  headless: HeadlessClient;
  env: RegistrarEnv;
}): Promise<NameSearchResult> {
  const sld = normalizeSld(input.query);
  try {
    assertValidSld(sld);
    const r = await input.headless.searchAgentName(sld);
    return {
      sld: r.sld,
      domain: r.domain,
      available: r.available,
      reason: r.reason,
      priceCentsPerYear: input.env.AGENTID_NAME_PRICE_CENTS,
      maxYears: input.env.AGENTID_NAME_MAX_YEARS,
    };
  } catch (err) {
    return fromHeadless(err);
  }
}

// ------------------------------------------------------------------ checkout

export interface StartCheckoutInput {
  tenantDb: TenantDb;
  tenantId: string;
  principalDid: string;
  sld: string;
  years: number;
  headless: HeadlessClient;
  stripe: StripeCheckoutLike | null;
  env: RegistrarEnv;
  successUrl: string;
  cancelUrl: string;
}

export async function startNameCheckout(
  input: StartCheckoutInput,
): Promise<{ url: string; registration: DomainRegistrationRow }> {
  const sld = normalizeSld(input.sld);
  const years = Math.floor(input.years);
  if (!Number.isFinite(years) || years < 1 || years > input.env.AGENTID_NAME_MAX_YEARS) {
    throw new RegistrarError('bad_years', `years must be 1..${input.env.AGENTID_NAME_MAX_YEARS}`, 400);
  }
  if (!input.stripe) {
    throw new RegistrarError('payments_not_configured', 'Payments are not configured.', 503);
  }

  // Re-check availability right before we take money.
  let availability;
  try {
    assertValidSld(sld);
    availability = await input.headless.searchAgentName(sld);
  } catch (err) {
    return fromHeadless(err);
  }
  if (!availability.available) {
    throw new RegistrarError('name_taken', availability.reason || `${sld}.agent is not available`, 409);
  }

  // One live registration per name per tenant.
  const prior = await input.tenantDb.getRegistrationByDomain(`${sld}.agent`);
  if (prior && !['failed', 'expired'].includes(prior.status)) {
    if (prior.status === 'pending_payment') {
      // Fall through: a fresh checkout replaces the abandoned one.
    } else {
      throw new RegistrarError('already_owned', `${sld}.agent is already registered on this account`, 409);
    }
  }

  const priceCents = input.env.AGENTID_NAME_PRICE_CENTS * years;
  const registration = await input.tenantDb.createRegistration({ sld, years, priceCents });

  const session = await input.stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: input.tenantId,
    metadata: {
      kind: NAME_CHECKOUT_KIND,
      registration_id: registration.id,
      tenant_id: input.tenantId,
      principal_did: input.principalDid,
      sld,
      years: String(years),
    },
    payment_intent_data: {
      metadata: {
        kind: NAME_CHECKOUT_KIND,
        registration_id: registration.id,
        tenant_id: input.tenantId,
        sld,
      },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: priceCents,
          product_data: {
            name: `${sld}.agent`,
            description: `AgentID name registration · ${years} year${years === 1 ? '' : 's'}`,
          },
        },
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });

  const updated = await input.tenantDb.updateRegistration(registration.id, {
    stripeCheckoutSessionId: session.id,
  });
  if (!session.url) throw new RegistrarError('payments_not_configured', 'Checkout could not be started.', 503);
  return { url: session.url, registration: updated ?? registration };
}

// ------------------------------------------------------------------ fulfilment

export interface FulfilInput {
  /** TenantDb resolved from the Stripe session's tenant metadata. */
  tenantDb: TenantDb;
  /** The completed Stripe Checkout Session (verified upstream). */
  session: {
    id: string;
    payment_intent?: string | { id: string } | null;
    metadata?: Record<string, string> | null;
  };
  headless: HeadlessClient;
  stripe: StripeRefundLike | null;
  sealKey: Uint8Array;
  env: RegistrarEnv;
  /** Test hook / clock. */
  now?: () => Date;
}

export type FulfilOutcome =
  | { outcome: 'registered'; registration: DomainRegistrationRow; agentDid: string }
  | { outcome: 'skipped'; reason: string; registration: DomainRegistrationRow | null }
  | {
      outcome: 'failed';
      registration: DomainRegistrationRow;
      /** Customer-safe message (also persisted on the row). */
      error: string;
      /** Upstream detail for logs/analytics only — never shown to the customer. */
      detail: string;
      refunded: boolean;
    };

export async function fulfilNameCheckout(input: FulfilInput): Promise<FulfilOutcome> {
  const meta = input.session.metadata ?? {};
  if (meta['kind'] !== NAME_CHECKOUT_KIND) {
    return { outcome: 'skipped', reason: 'not_a_name_checkout', registration: null };
  }
  const registrationId = meta['registration_id'];
  if (!registrationId) return { outcome: 'skipped', reason: 'no_registration_id', registration: null };

  const registration = await input.tenantDb.getRegistration(registrationId);
  if (!registration) return { outcome: 'skipped', reason: 'unknown_registration', registration: null };
  if (registration.status !== 'pending_payment') {
    // Replayed webhook or already handled — idempotent.
    return { outcome: 'skipped', reason: `already_${registration.status}`, registration };
  }

  const paymentIntentId =
    typeof input.session.payment_intent === 'string'
      ? input.session.payment_intent
      : input.session.payment_intent?.id ?? null;

  await input.tenantDb.updateRegistration(registration.id, {
    status: 'registering',
    stripeCheckoutSessionId: input.session.id,
    stripePaymentIntentId: paymentIntentId,
  });

  try {
    const reg = await input.headless.registerDomain({ sld: registration.sld, years: registration.years });
    const mirror = mirrorOriginFor(registration.domain, input.env.AGENTID_MIRROR_SUFFIX);
    const minted = await mintIdentity({
      tenantDb: input.tenantDb,
      domain: registration.domain,
      principalDid: meta['principal_did'] ?? (await input.tenantDb.getTenant())?.principalDid ?? 'did:key:unknown',
      agentName: registration.sld,
      agentDescription: '',
      custody: 'cloud',
      runtimeKind: 'none',
      domainRegistrationId: registration.id,
      wellKnownOrigin: mirror,
      mirrorOrigin: mirror,
      sealKey: input.sealKey,
      force: true,
    });
    const updated = await input.tenantDb.updateRegistration(registration.id, {
      status: 'registered',
      headlessDomainId: reg.headlessDomainId,
      headlessOrderId: reg.headlessOrderId,
      registeredAt: (input.now ?? (() => new Date()))(),
      expiryAt: reg.expiryAt,
      graceEndsAt: reg.graceEndsAt,
      error: null,
    });
    return { outcome: 'registered', registration: updated ?? registration, agentDid: minted.agentDid };
  } catch (err) {
    const detail =
      err instanceof HeadlessError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : String(err);
    let refunded = false;
    if (paymentIntentId && input.stripe) {
      try {
        await input.stripe.refunds.create({ payment_intent: paymentIntentId, reason: 'requested_by_customer' });
        refunded = true;
      } catch {
        refunded = false;
      }
    }
    // The persisted message is what the dashboard shows. Keep it neutral:
    // no supplier names, no upstream error text.
    const error = refunded
      ? 'Registration could not be completed. Your payment has been refunded.'
      : 'Registration could not be completed. A refund is being processed.';
    const updated = await input.tenantDb.updateRegistration(registration.id, { status: 'failed', error });
    return { outcome: 'failed', registration: updated ?? registration, error, detail, refunded };
  }
}
