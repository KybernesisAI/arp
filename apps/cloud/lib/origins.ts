/**
 * Every public address the product uses, in one place (domain migration,
 * 2026-09-29). AgentID owns all of them; ARP is only the protocol underneath
 * and no product URL points at arp.run.
 *
 *   site      https://agentid.dev            lander, profiles (/<sld>), badge
 *   console   https://cloud.agentid.dev      signed-in app + API + webhooks
 *   mirror    https://<sld>.agentid.dev      an identity's machine surface
 *   gateway   https://gateway.agentid.dev    push / A2A / pairing gateway
 *
 * Overridable per environment (staging, local) via env; tests pin their own.
 * Safe in server and client code: only reads `process.env` at call time and
 * the NEXT_PUBLIC_* variants are inlined at build for the browser.
 */

function clean(v: string | undefined, fallback: string): string {
  return (v && v.trim() ? v.trim() : fallback).replace(/\/+$/, '');
}

export const DEFAULT_SITE_ORIGIN = 'https://agentid.dev';
export const DEFAULT_CONSOLE_ORIGIN = 'https://cloud.agentid.dev';
export const DEFAULT_GATEWAY_ORIGIN = 'https://gateway.agentid.dev';
export const DEFAULT_MIRROR_SUFFIX = '.agentid.dev';

export interface Origins {
  /** Marketing site + public profiles + badge, e.g. `https://agentid.dev`. */
  site: string;
  /** Signed-in console + API, e.g. `https://cloud.agentid.dev`. */
  console: string;
  /** Gateway origin, e.g. `https://gateway.agentid.dev`. */
  gateway: string;
  /** Mirror suffix incl. leading dot, e.g. `.agentid.dev` → `https://<sld>.agentid.dev`. */
  mirrorSuffix: string;
  /** Hostname of `console` (for WebAuthn origins, `did:web:<host>:u:<uuid>` issuers, cookies). */
  consoleHost: string;
  /** Registrable domain, e.g. `agentid.dev` (WebAuthn rpId). */
  apexHost: string;
}

export function origins(): Origins {
  const site = clean(process.env['NEXT_PUBLIC_SITE_ORIGIN'] ?? process.env['SITE_ORIGIN'], DEFAULT_SITE_ORIGIN);
  const consoleOrigin = clean(process.env['NEXT_PUBLIC_CONSOLE_ORIGIN'] ?? process.env['CONSOLE_ORIGIN'], DEFAULT_CONSOLE_ORIGIN);
  const gateway = clean(process.env['ARP_CLOUD_GATEWAY_ORIGIN'], DEFAULT_GATEWAY_ORIGIN);
  const mirrorSuffix = (process.env['AGENTID_MIRROR_SUFFIX'] ?? DEFAULT_MIRROR_SUFFIX).toLowerCase().replace(/^\.?/, '.');
  const consoleHost = hostOf(consoleOrigin);
  return { site, console: consoleOrigin, gateway, mirrorSuffix, consoleHost, apexHost: hostOf(site).replace(/^www\./, '') };
}

export function hostOf(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return origin.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  }
}

/** `samantha` → `https://agentid.dev/samantha`. */
export function profileUrl(sld: string): string {
  return `${origins().site}/${encodeURIComponent(sld)}`;
}
/** `samantha` → `https://samantha.agentid.dev`. */
export function mirrorOrigin(sld: string): string {
  return `https://${sld}${origins().mirrorSuffix}`;
}
/** `/pair?peer=…` → `https://cloud.agentid.dev/pair?peer=…`. */
export function consoleUrl(path: string): string {
  return `${origins().console}${path.startsWith('/') ? path : `/${path}`}`;
}
export function siteUrl(path: string): string {
  return `${origins().site}${path.startsWith('/') ? path : `/${path}`}`;
}
/** Connect / pairing link for an agent, shown on badges and cards. */
export function pairUrlFor(agentDid: string): string {
  return consoleUrl(`/pair?peer=${encodeURIComponent(agentDid)}`);
}
/** Standalone badge stage. */
export function badgeUrl(sld: string): string {
  return siteUrl(`/badge?name=${encodeURIComponent(sld)}`);
}

/**
 * Names that can never be registered because they are hostnames or root
 * paths of the product (on top of the registrar's own reserved list).
 */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'www', 'cloud', 'gateway', 'api', 'app', 'admin', 'mail', 'status', 'docs', 'spec', 'agent', 'agentid', 'agents',
  'badge', 'i', 'gift', 'pair', 'connections', 'names', 'account', 'dashboard', 'billing', 'onboarding', 'onboard',
  'login', 'logout', 'signup', 'support', 'legal', 'terms', 'privacy', 'pricing', 'lander', 'assets', 'u', 'internal',
  'runtime', 'project', 'cron', 'webhooks', 'static', 'public', 'help', 'about', 'blog', 'settings',
]);
