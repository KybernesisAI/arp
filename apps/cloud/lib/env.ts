/**
 * Env variable accessor. Centralized so route handlers + lib code never
 * reach into process.env directly.
 */

interface EnvShape {
  ARP_CLOUD_SESSION_SECRET: string;
  ARP_CLOUD_HOST: string;
  ARP_CLOUD_WS_PUBLIC_URL: string;
  ARP_CLOUD_REGISTRAR_PSK: string | null;
  STRIPE_SECRET_KEY: string | null;
  STRIPE_WEBHOOK_SECRET: string | null;
  /** Phase-10: single $5/mo licensed price; subscription `quantity` carries
   *  the per-tenant agent count. Replaces the v0 STRIPE_PRICE_PRO + _TEAM split. */
  STRIPE_PRICE_PRO_PER_AGENT: string | null;
  DATABASE_URL: string | null;
  APP_ARP_SPEC_HOST: string;
  WEBAUTHN_RP_ID: string;
  WEBAUTHN_RP_NAME: string;
  WEBAUTHN_ORIGINS: string[];
  /** AgentID S2: Headless Domains registrar credentials (master reseller account). */
  HEADLESS_API_KEY: string | null;
  HEADLESS_BASE_URL: string;
  HEADLESS_RESELLER_CHANNEL: string;
  HEADLESS_WEBHOOK_SECRET: string | null;
  /** AgentID S2: sealing key for cloud-custody agent seeds (32 bytes, base64 or hex). */
  ARP_CLOUD_KEY_ENCRYPTION_KEY: string | null;
  /** AgentID S2: ICANN mirror suffix, e.g. `.agent.arp.run` → `https://<sld>.agent.arp.run`. */
  AGENTID_MIRROR_SUFFIX: string;
  /** AgentID S2: public profile base, e.g. `https://agent.arp.run` → `/<sld>`. */
  AGENTID_PROFILE_BASE: string;
  /** AgentID S2: name price placeholders until Ian sets real numbers. */
  AGENTID_NAME_PRICE_CENTS: number;
  AGENTID_NAME_MAX_YEARS: number;
}

let cached: EnvShape | null = null;

/**
 * Session-cookie HMAC secret. Fails closed on production deployments: an
 * unset secret used to silently fall back to a fixed dev string, which would
 * let anyone forge session cookies on a misconfigured prod host. Preview /
 * dev / test keep the fallback so local flows need no setup.
 */
function sessionSecret(): string {
  const value = process.env['ARP_CLOUD_SESSION_SECRET'];
  if (value && value.length > 0) return value;
  if (process.env['VERCEL_ENV'] === 'production') {
    throw new Error(
      'ARP_CLOUD_SESSION_SECRET must be set on production deployments (refusing insecure default)',
    );
  }
  return 'dev-only-insecure-secret';
}

export function env(): EnvShape {
  if (cached) return cached;
  cached = {
    ARP_CLOUD_SESSION_SECRET: sessionSecret(),
    ARP_CLOUD_HOST: process.env['ARP_CLOUD_HOST'] ?? 'arp-cloud.vercel.app',
    ARP_CLOUD_WS_PUBLIC_URL:
      process.env['ARP_CLOUD_WS_PUBLIC_URL'] ?? 'ws://localhost:3001/ws',
    ARP_CLOUD_REGISTRAR_PSK: process.env['ARP_CLOUD_REGISTRAR_PSK'] ?? null,
    STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] ?? null,
    STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] ?? null,
    // Falls back to STRIPE_PRICE_PRO so deployments that haven't rotated
    // the env var name yet still work.
    STRIPE_PRICE_PRO_PER_AGENT:
      process.env['STRIPE_PRICE_PRO_PER_AGENT'] ?? process.env['STRIPE_PRICE_PRO'] ?? null,
    DATABASE_URL: process.env['DATABASE_URL'] ?? null,
    APP_ARP_SPEC_HOST: process.env['APP_ARP_SPEC_HOST'] ?? 'app.arp.spec',
    // Phase 9d WebAuthn: rp.id is the apex domain so passkeys registered on
    // one surface work on every surface (arp.run, cloud.arp.run, app.arp.run).
    // Override with WEBAUTHN_RP_ID=localhost for local development.
    WEBAUTHN_RP_ID: process.env['WEBAUTHN_RP_ID'] ?? 'arp.run',
    WEBAUTHN_RP_NAME: process.env['WEBAUTHN_RP_NAME'] ?? 'ARP',
    // Allowed origins the authenticator ceremony may come from. Defaults
    // cover production + dev; override with a comma-separated list in
    // staging environments.
    WEBAUTHN_ORIGINS: (
      process.env['WEBAUTHN_ORIGINS'] ??
      'https://arp.run,https://cloud.arp.run,https://app.arp.run,http://localhost:3000'
    )
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    HEADLESS_API_KEY: process.env['HEADLESS_API_KEY'] ?? null,
    HEADLESS_BASE_URL: process.env['HEADLESS_BASE_URL'] ?? 'https://headlessdomains.com',
    HEADLESS_RESELLER_CHANNEL: process.env['HEADLESS_RESELLER_CHANNEL'] ?? 'arp.run',
    HEADLESS_WEBHOOK_SECRET: process.env['HEADLESS_WEBHOOK_SECRET'] ?? null,
    ARP_CLOUD_KEY_ENCRYPTION_KEY: process.env['ARP_CLOUD_KEY_ENCRYPTION_KEY'] ?? null,
    AGENTID_MIRROR_SUFFIX: process.env['AGENTID_MIRROR_SUFFIX'] ?? '.agent.arp.run',
    AGENTID_PROFILE_BASE: (process.env['AGENTID_PROFILE_BASE'] ?? 'https://agent.arp.run').replace(/\/+$/, ''),
    AGENTID_NAME_PRICE_CENTS: Number.parseInt(process.env['AGENTID_NAME_PRICE_CENTS'] ?? '2900', 10),
    AGENTID_NAME_MAX_YEARS: Number.parseInt(process.env['AGENTID_NAME_MAX_YEARS'] ?? '3', 10),
  };
  return cached;
}

export function resetEnvForTests(): void {
  cached = null;
}
