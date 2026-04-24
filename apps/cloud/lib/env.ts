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
  STRIPE_PRICE_PRO: string | null;
  STRIPE_PRICE_TEAM: string | null;
  DATABASE_URL: string | null;
  APP_ARP_SPEC_HOST: string;
  WEBAUTHN_RP_ID: string;
  WEBAUTHN_RP_NAME: string;
  WEBAUTHN_ORIGINS: string[];
}

let cached: EnvShape | null = null;

export function env(): EnvShape {
  if (cached) return cached;
  cached = {
    ARP_CLOUD_SESSION_SECRET:
      process.env['ARP_CLOUD_SESSION_SECRET'] ?? 'dev-only-insecure-secret',
    ARP_CLOUD_HOST: process.env['ARP_CLOUD_HOST'] ?? 'arp-cloud.vercel.app',
    ARP_CLOUD_WS_PUBLIC_URL:
      process.env['ARP_CLOUD_WS_PUBLIC_URL'] ?? 'ws://localhost:3001/ws',
    ARP_CLOUD_REGISTRAR_PSK: process.env['ARP_CLOUD_REGISTRAR_PSK'] ?? null,
    STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] ?? null,
    STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] ?? null,
    STRIPE_PRICE_PRO: process.env['STRIPE_PRICE_PRO'] ?? null,
    STRIPE_PRICE_TEAM: process.env['STRIPE_PRICE_TEAM'] ?? null,
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
  };
  return cached;
}

export function resetEnvForTests(): void {
  cached = null;
}
