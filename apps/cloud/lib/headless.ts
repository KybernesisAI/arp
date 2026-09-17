/**
 * Headless Domains registrar client (AgentID slice S2, task T1).
 *
 * Thin, typed wrapper over the parts of the Headless API we use to act as a
 * `.agent` registrar-of-record: availability search, non-mutating quote,
 * registration on our master (reseller) account, public lookup, owned-domain
 * reconciliation, and webhook subscription/verification.
 *
 * Ground truth for every shape here: `docs/headless/openapi-2026-09-17.json`
 * and the live captures under `tests/fixtures/headless/`. Anything Headless
 * returns that we don't consume is passed through untouched on `raw`.
 *
 * No HNS/DoH in this module by design — see the S2 brief §0.2.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  INFRASTRUCTURE_RESERVED_NAMES,
  PROTOCOL_RESERVED_NAMES,
} from '@kybernesis/arp-spec';

// ------------------------------------------------------------------ errors

export type HeadlessErrorCode =
  | 'invalid_sld'
  | 'reserved'
  | 'name_taken'
  | 'payment_required'
  | 'insufficient_funds'
  | 'unauthorized'
  | 'rate_limited'
  | 'not_found'
  | 'upstream'
  | 'bad_response';

export class HeadlessError extends Error {
  readonly code: HeadlessErrorCode;
  readonly status: number | null;
  readonly detail: unknown;
  constructor(code: HeadlessErrorCode, message: string, status: number | null = null, detail?: unknown) {
    super(message);
    this.name = 'HeadlessError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

// ------------------------------------------------------------------ sld rules

/** Second-level label rules for a `.agent` name (Headless + our reserved lists). */
export const SLD_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

const RESERVED = new Set<string>([
  ...PROTOCOL_RESERVED_NAMES.map((n) => n.toLowerCase()),
  ...INFRASTRUCTURE_RESERVED_NAMES.map((n) => n.toLowerCase()),
]);

export function normalizeSld(input: string): string {
  return input.trim().toLowerCase().replace(/\.agent$/, '');
}

export function assertValidSld(sld: string): void {
  if (!SLD_REGEX.test(sld)) {
    throw new HeadlessError('invalid_sld', `invalid .agent name: ${sld}`);
  }
  if (RESERVED.has(sld)) {
    throw new HeadlessError('reserved', `${sld}.agent is a reserved name`);
  }
}

// ------------------------------------------------------------------ schemas

const SearchRow = z
  .object({
    domain: z.string(),
    tld: z.string(),
    available: z.boolean(),
    reason: z.string().optional().default(''),
    human_price: z.number().optional(),
    human_price_currency: z.string().optional(),
    agent_price: z.number().optional(),
    agent_price_currency: z.string().optional(),
    agent_mpp_price: z
      .object({ amount: z.number(), currency: z.string().optional() })
      .partial()
      .optional(),
    launch_phase: z.string().optional(),
    landgrab_multiplier: z.number().optional(),
    for_sale: z.boolean().nullable().optional(),
  })
  .passthrough();

const SearchResponse = z.object({
  query: z.string().optional(),
  results: z.array(SearchRow),
});

export interface AgentNameAvailability {
  sld: string;
  domain: string;
  available: boolean;
  /** Headless's human-readable reason when unavailable (e.g. "Registered on …"). */
  reason: string;
  /** Retail prices Headless would charge directly. Informational only — we set our own. */
  retail: {
    humanGems: number | null;
    agentGems: number | null;
    agentUsd: number | null;
  };
  launchPhase: string | null;
  landgrabMultiplier: number | null;
  raw: z.infer<typeof SearchRow>;
}

const RegisterResponse = z
  .object({
    success: z.boolean().optional(),
    result: z.string().optional(),
    domain: z.string(),
    domain_id: z.union([z.number(), z.string()]).optional(),
    order_id: z.union([z.number(), z.string()]).optional(),
    status: z.string().optional(),
    domain_status: z.string().optional(),
    expiry_date: z.string().optional(),
    grace_ends_at: z.string().nullable().optional(),
    payment_method: z.string().optional(),
    owner_id: z.union([z.number(), z.string()]).nullable().optional(),
    reseller_channel: z.string().nullable().optional(),
    target_owner_id: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .passthrough();

export interface RegisterResult {
  domain: string;
  headlessDomainId: string | null;
  headlessOrderId: string | null;
  status: string;
  expiryAt: Date | null;
  graceEndsAt: Date | null;
  ownerId: string | null;
  raw: z.infer<typeof RegisterResponse>;
}

const LookupResponse = z
  .object({
    domain: z
      .object({
        name: z.string(),
        status: z.string().optional(),
        tld: z.string().optional(),
        registration_date: z.string().optional(),
        expiry_date: z.string().optional(),
        grace_ends_at: z.string().nullable().optional(),
      })
      .passthrough(),
    identity: z.object({}).passthrough().optional(),
    integrations: z
      .object({
        arp_chat: z
          .object({ enabled: z.boolean().optional(), url: z.string().nullable().optional() })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    manifests: z.object({}).passthrough().optional(),
    profile: z
      .object({
        _arp: z
          .object({
            owner_label: z.string().optional(),
            representation_jwt: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export interface LookupResult {
  domain: string;
  status: string | null;
  expiryAt: Date | null;
  graceEndsAt: Date | null;
  arpChatEnabled: boolean;
  /** The v2.1 owner binding as Headless stores it (null if never bound). */
  arpBinding: { ownerLabel: string | null; representationJwt: string | null } | null;
  raw: z.infer<typeof LookupResponse>;
}

const MyDomainsResponse = z.object({
  status: z.string().optional(),
  data: z.array(
    z
      .object({
        id: z.union([z.number(), z.string()]),
        name: z.string(),
        tld: z.string().optional(),
        status: z.string().optional(),
        expiry_date: z.string().optional(),
        owner_id: z.union([z.number(), z.string()]).nullable().optional(),
      })
      .passthrough(),
  ),
});

export interface OwnedDomain {
  headlessDomainId: string;
  domain: string;
  status: string | null;
  expiryAt: Date | null;
  raw: z.infer<typeof MyDomainsResponse>['data'][number];
}

const PricingResponse = z.object({
  currency: z.string().optional(),
  data: z.array(
    z
      .object({
        tld: z.string(),
        registration_price_human_usd: z.number().optional(),
        registration_price_agent_usd: z.number().optional(),
        renewal_price_human_usd: z.number().optional(),
        renewal_price_agent_usd: z.number().optional(),
        registration_available: z.boolean().optional(),
      })
      .passthrough(),
  ),
});

export interface AgentTldPricing {
  registrationHumanUsd: number | null;
  registrationAgentUsd: number | null;
  renewalHumanUsd: number | null;
  renewalAgentUsd: number | null;
}

// ------------------------------------------------------------------ client

export interface HeadlessClientOptions {
  /** `hd_live_…` master account key. Null = unauthenticated (search/lookup/pricing only). */
  apiKey: string | null;
  baseUrl?: string;
  resellerChannel?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface HeadlessClient {
  searchAgentName(sld: string): Promise<AgentNameAvailability>;
  quote(input: { sld: string; years: number; couponCode?: string }): Promise<Record<string, unknown>>;
  registerDomain(input: { sld: string; years: number; targetOwnerId?: string }): Promise<RegisterResult>;
  lookup(sld: string): Promise<LookupResult | null>;
  myDomains(): Promise<OwnedDomain[]>;
  getAgentPricing(): Promise<AgentTldPricing | null>;
  subscribeWebhook(input: { targetUrl: string; events: string[]; secret: string }): Promise<Record<string, unknown>>;
}

export const HEADLESS_WEBHOOK_EVENTS = [
  'domain.registered',
  'domain.renewed',
  'domain.expired',
  'profile.updated',
] as const;

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function idToString(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

export function createHeadlessClient(opts: HeadlessClientOptions): HeadlessClient {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('fetch not available');
  const baseUrl = (opts.baseUrl ?? 'https://headlessdomains.com').replace(/\/+$/, '');
  const resellerChannel = opts.resellerChannel ?? 'arp.run';
  const timeoutMs = opts.timeoutMs ?? 15_000;

  async function call(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    auth: 'required' | 'optional' = 'optional',
  ): Promise<{ status: number; json: unknown }> {
    if (auth === 'required' && !opts.apiKey) {
      throw new HeadlessError('unauthorized', 'HEADLESS_API_KEY is not configured');
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (opts.apiKey) headers['x-api-key'] = opts.apiKey;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let json: unknown = null;
      if (text.length > 0) {
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw_text: text };
        }
      }
      return { status: res.status, json };
    } catch (err) {
      throw new HeadlessError('upstream', `headless ${method} ${path} failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  function mapCommonError(status: number, json: unknown, path: string): never {
    if (status === 401 || status === 403) {
      throw new HeadlessError('unauthorized', `headless rejected credentials on ${path}`, status, json);
    }
    if (status === 404) throw new HeadlessError('not_found', `headless 404 on ${path}`, status, json);
    if (status === 429) throw new HeadlessError('rate_limited', `headless rate limit on ${path}`, status, json);
    throw new HeadlessError('upstream', `headless ${status} on ${path}`, status, json);
  }

  return {
    async searchAgentName(input) {
      const sld = normalizeSld(input);
      assertValidSld(sld);
      const path = `/api/v1/domains/search?q=${encodeURIComponent(sld)}`;
      const { status, json } = await call('GET', path);
      if (status !== 200) mapCommonError(status, json, path);
      const parsed = SearchResponse.safeParse(json);
      if (!parsed.success) {
        throw new HeadlessError('bad_response', 'unexpected search response shape', status, parsed.error.issues);
      }
      const row = parsed.data.results.find((r) => r.tld === 'agent');
      if (!row) {
        throw new HeadlessError('bad_response', 'search response had no .agent row', status, json);
      }
      return {
        sld,
        domain: row.domain,
        available: row.available,
        reason: row.reason ?? '',
        retail: {
          humanGems: row.human_price ?? null,
          agentGems: row.agent_price ?? null,
          agentUsd: row.agent_mpp_price?.amount ?? null,
        },
        launchPhase: row.launch_phase ?? null,
        landgrabMultiplier: row.landgrab_multiplier ?? null,
        raw: row,
      };
    },

    async quote(input) {
      const sld = normalizeSld(input.sld);
      assertValidSld(sld);
      const path = '/api/v1/domains/quote';
      const { status, json } = await call(
        'POST',
        path,
        {
          domain: sld,
          namespace: 'agent',
          years: input.years,
          ...(input.couponCode ? { coupon_code: input.couponCode } : {}),
        },
        'required',
      );
      if (status === 409) throw new HeadlessError('name_taken', `${sld}.agent is no longer available`, status, json);
      if (status !== 200) mapCommonError(status, json, path);
      return (json ?? {}) as Record<string, unknown>;
    },

    async registerDomain(input) {
      const sld = normalizeSld(input.sld);
      assertValidSld(sld);
      const path = '/api/v1/domains/register';
      const { status, json } = await call(
        'POST',
        path,
        {
          domain: sld,
          namespace: 'agent',
          years: input.years,
          agreed_to_terms: true,
          payment_method: 'gems',
          reseller_channel: resellerChannel,
          ...(input.targetOwnerId ? { target_owner_id: input.targetOwnerId } : {}),
        },
        'required',
      );
      if (status === 402) {
        // With payment_method=gems a 402 means the master account balance is short,
        // not that an MPP challenge is expected.
        throw new HeadlessError('insufficient_funds', 'headless returned 402 for a gems registration', status, json);
      }
      if (status === 409) throw new HeadlessError('name_taken', `${sld}.agent is no longer available`, status, json);
      if (status === 403) throw new HeadlessError('reserved', `${sld}.agent is reserved or restricted`, status, json);
      if (status !== 200 && status !== 201) mapCommonError(status, json, path);
      const parsed = RegisterResponse.safeParse(json);
      if (!parsed.success) {
        throw new HeadlessError('bad_response', 'unexpected register response shape', status, parsed.error.issues);
      }
      const d = parsed.data;
      return {
        domain: d.domain,
        headlessDomainId: idToString(d.domain_id),
        headlessOrderId: idToString(d.order_id),
        status: d.domain_status ?? d.status ?? 'active',
        expiryAt: toDate(d.expiry_date),
        graceEndsAt: toDate(d.grace_ends_at),
        ownerId: idToString(d.owner_id),
        raw: d,
      };
    },

    async lookup(input) {
      const sld = normalizeSld(input);
      const path = `/api/v1/lookup/${encodeURIComponent(`${sld}.agent`)}`;
      const { status, json } = await call('GET', path);
      if (status === 404) return null;
      if (status !== 200) mapCommonError(status, json, path);
      const parsed = LookupResponse.safeParse(json);
      if (!parsed.success) {
        throw new HeadlessError('bad_response', 'unexpected lookup response shape', status, parsed.error.issues);
      }
      const d = parsed.data;
      const arp = d.profile?._arp;
      return {
        domain: d.domain.name,
        status: d.domain.status ?? null,
        expiryAt: toDate(d.domain.expiry_date),
        graceEndsAt: toDate(d.domain.grace_ends_at),
        arpChatEnabled: d.integrations?.arp_chat?.enabled ?? false,
        arpBinding: arp
          ? { ownerLabel: arp.owner_label ?? null, representationJwt: arp.representation_jwt ?? null }
          : null,
        raw: d,
      };
    },

    async myDomains() {
      const path = '/api/v1/my-domains';
      const { status, json } = await call('GET', path, undefined, 'required');
      if (status !== 200) mapCommonError(status, json, path);
      const parsed = MyDomainsResponse.safeParse(json);
      if (!parsed.success) {
        throw new HeadlessError('bad_response', 'unexpected my-domains response shape', status, parsed.error.issues);
      }
      return parsed.data.data.map((row) => ({
        headlessDomainId: String(row.id),
        domain: row.name,
        status: row.status ?? null,
        expiryAt: toDate(row.expiry_date),
        raw: row,
      }));
    },

    async getAgentPricing() {
      const path = '/api/v1/integrations/shakeshift/pricing';
      const { status, json } = await call('GET', path);
      if (status !== 200) mapCommonError(status, json, path);
      const parsed = PricingResponse.safeParse(json);
      if (!parsed.success) {
        throw new HeadlessError('bad_response', 'unexpected pricing response shape', status, parsed.error.issues);
      }
      const row = parsed.data.data.find((r) => r.tld === 'agent');
      if (!row) return null;
      return {
        registrationHumanUsd: row.registration_price_human_usd ?? null,
        registrationAgentUsd: row.registration_price_agent_usd ?? null,
        renewalHumanUsd: row.renewal_price_human_usd ?? null,
        renewalAgentUsd: row.renewal_price_agent_usd ?? null,
      };
    },

    async subscribeWebhook(input) {
      const path = '/api/v1/webhooks/subscribe';
      const { status, json } = await call(
        'POST',
        path,
        { target_url: input.targetUrl, events: input.events, secret: input.secret },
        'required',
      );
      if (status !== 200 && status !== 201) mapCommonError(status, json, path);
      return (json ?? {}) as Record<string, unknown>;
    },
  };
}

// ------------------------------------------------------------------ webhooks

/**
 * Verify `X-Headless-Signature` (hex HMAC-SHA256 over the raw request body).
 * Constant-time; returns false on any malformed input rather than throwing.
 */
export function verifyHeadlessWebhookSignature(
  rawBody: string | Uint8Array,
  signatureHex: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHex || !/^[0-9a-f]+$/i.test(signatureHex)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signatureHex, 'hex');
  } catch {
    return false;
  }
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

const WebhookEvent = z.object({
  event_id: z.string(),
  event_type: z.enum(HEADLESS_WEBHOOK_EVENTS),
  timestamp: z.string().optional(),
  data: z.record(z.unknown()).default({}),
});
export type HeadlessWebhookEvent = z.infer<typeof WebhookEvent>;

export function parseHeadlessWebhookEvent(json: unknown): HeadlessWebhookEvent | null {
  const parsed = WebhookEvent.safeParse(json);
  return parsed.success ? parsed.data : null;
}

// ------------------------------------------------------------------ singleton

let defaultClient: HeadlessClient | null = null;

/** Process-wide client built from `env()`. Tests should construct their own. */
export function getHeadlessClient(env: {
  HEADLESS_API_KEY: string | null;
  HEADLESS_BASE_URL: string;
  HEADLESS_RESELLER_CHANNEL: string;
}): HeadlessClient {
  if (defaultClient) return defaultClient;
  defaultClient = createHeadlessClient({
    apiKey: env.HEADLESS_API_KEY,
    baseUrl: env.HEADLESS_BASE_URL,
    resellerChannel: env.HEADLESS_RESELLER_CHANNEL,
  });
  return defaultClient;
}

export function resetHeadlessClientForTests(): void {
  defaultClient = null;
}
