import { createFetchDohClient, createLocalHnsdClient, resolveHnsRaw } from '@kybernesis/arp-resolver';
import type { Probe, ProbeContext, ProbeResult } from '../types.js';
import { elapsed, now } from '../timing.js';

/**
 * DNS probe — verifies that the four ARP-required TXT records exist at the
 * target apex with the correct leading labels and key=value shape.
 *
 * Required TXT records (ARP-tld-integration-spec-v2.md §5.1):
 *   _arp.<apex>         v=1; caps=didcomm,...; pdp=cedar
 *   _did.<apex>         did=did:web:<apex>; fp=<sha256 hex>
 *   _didcomm.<apex>     url=https://<apex>/didcomm; v=2
 *   _revocation.<apex>  url=<owner-subdomain>/revocations.json; poll=<int>
 *
 * Runs against HNS DoH by default (hnsdoh.com). Tests inject a custom DoH
 * endpoint (or a mock `fetchImpl`) via the probe context.
 *
 * Skip semantics: if the target looks like `localhost:<port>` or `127.0.0.1`
 * we return `skipped: true`; the probe is only meaningful against real HNS
 * apex names.
 */
export const dnsProbe: Probe = async (ctx: ProbeContext): Promise<ProbeResult> => {
  const startedAt = now();
  const apex = apexFromTarget(ctx.target);
  if (isLocalhost(apex)) {
    return {
      name: 'dns',
      pass: true,
      durationMs: elapsed(startedAt),
      skipped: true,
      skipReason: 'target is localhost; DNS probe only runs against HNS apex names',
      details: { target: ctx.target },
    };
  }

  const doh =
    ctx.dohClient
      ? ctx.dohClient
      : ctx.dohEndpoint === 'local:hnsd'
        ? createLocalHnsdClient()
        : createFetchDohClient({
            endpoint: ctx.dohEndpoint ?? 'https://hnsdoh.com/dns-query',
            ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
            timeoutMs: ctx.timeoutMs ?? 10_000,
          });

  try {
    const resolution = await resolveHnsRaw(doh, apex);
    const required = ['_arp', '_did', '_didcomm', '_revocation'] as const;
    const missing: string[] = [];
    const malformed: string[] = [];
    const found: Record<string, string[]> = {};
    for (const prefix of required) {
      const values = resolution.txt[prefix] ?? [];
      if (values.length === 0) {
        missing.push(prefix);
        continue;
      }
      found[prefix] = values;
      const firstValue = values[0];
      if (!firstValue) continue;
      if (!validateTxtShape(prefix, firstValue, apex)) {
        malformed.push(`${prefix}: ${firstValue}`);
      }
    }
    const pass = missing.length === 0 && malformed.length === 0;
    return {
      name: 'dns',
      pass,
      durationMs: elapsed(startedAt),
      details: {
        apex,
        found,
        ...(missing.length > 0 ? { missing } : {}),
        ...(malformed.length > 0 ? { malformed } : {}),
      },
      ...(pass
        ? {}
        : {
            error: {
              code: 'dns_records_invalid',
              message:
                missing.length > 0
                  ? `missing TXT records: ${missing.join(', ')}`
                  : `malformed TXT records: ${malformed.join('; ')}`,
            },
          }),
    };
  } catch (err) {
    return {
      name: 'dns',
      pass: false,
      durationMs: elapsed(startedAt),
      details: { apex },
      error: {
        code: 'doh_failure',
        message: (err as Error).message,
      },
    };
  }
};

function validateTxtShape(prefix: string, value: string, apex: string): boolean {
  const kv = parseKv(value);
  switch (prefix) {
    case '_arp':
      return (
        kv['v'] === '1' &&
        typeof kv['caps'] === 'string' &&
        kv['caps'].length > 0 &&
        typeof kv['pdp'] === 'string' &&
        kv['pdp'].length > 0
      );
    case '_did': {
      const did = kv['did'];
      const fp = kv['fp'];
      if (!did || !fp) return false;
      if (did !== `did:web:${apex}`) return false;
      return /^sha-?256[:]?/i.test(fp) || /^[0-9a-f]{64}$/i.test(fp);
    }
    case '_didcomm':
      return (
        typeof kv['url'] === 'string' &&
        kv['url'].startsWith('https://') &&
        kv['v'] === '2'
      );
    case '_revocation': {
      const url = kv['url'];
      const poll = kv['poll'];
      if (!url || !url.startsWith('https://')) return false;
      if (!poll || !/^\d+$/.test(poll)) return false;
      return true;
    }
    default:
      return false;
  }
}

function parseKv(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of value.split(';')) {
    const [rawK, ...rest] = part.split('=');
    if (!rawK) continue;
    const k = rawK.trim();
    if (!k) continue;
    out[k] = rest.join('=').trim();
  }
  return out;
}

function apexFromTarget(target: string): string {
  const noScheme = target.replace(/^https?:\/\//i, '');
  const hostOnly = noScheme.split('/')[0] ?? noScheme;
  return (hostOnly.split(':')[0] ?? hostOnly).toLowerCase();
}

function isLocalhost(apex: string): boolean {
  return (
    apex === 'localhost' ||
    apex === '127.0.0.1' ||
    apex === '::1' ||
    apex.endsWith('.local')
  );
}
