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
  };
  return cached;
}

export function resetEnvForTests(): void {
  cached = null;
}
