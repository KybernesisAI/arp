import { DohClient, DohRecordType } from './doh.js';

export type HnsTxtRecords = Record<string, string[]>;

export interface HnsResolution {
  a: string[];
  aaaa: string[];
  txt: HnsTxtRecords;
}

/**
 * Resolve a name via DoH. Queries A, AAAA, and TXT records.
 *
 * TXT records are grouped by the "leading label" convention used throughout
 * ARP — entries whose name starts with `_foo.<apex>` are grouped under the
 * `_foo` key so callers can look up ARP's well-known TXT records without
 * re-parsing the raw list. The apex TXT records (if any) are grouped under
 * the empty string key.
 */
export async function resolveHnsRaw(
  doh: DohClient,
  name: string,
  types: DohRecordType[] = ['A', 'AAAA', 'TXT'],
): Promise<HnsResolution> {
  const trimmed = name.replace(/\.$/, '');

  const [a, aaaa, txt] = await Promise.all([
    types.includes('A') ? doh.query(trimmed, 'A') : Promise.resolve([]),
    types.includes('AAAA') ? doh.query(trimmed, 'AAAA') : Promise.resolve([]),
    types.includes('TXT') ? queryTxtWithArpPrefixes(doh, trimmed) : Promise.resolve([]),
  ]);

  const txtGrouped: HnsTxtRecords = {};
  for (const record of txt) {
    const prefix = extractLeadingLabel(record.name, trimmed);
    const bucket = txtGrouped[prefix] ?? (txtGrouped[prefix] = []);
    bucket.push(unquoteTxt(record.data));
  }

  return {
    a: a.map((r) => r.data),
    aaaa: aaaa.map((r) => r.data),
    txt: txtGrouped,
  };
}

/**
 * Query TXT at the apex AND at each ARP-reserved leading label. ARP TXT
 * records live at `_arp.<apex>`, `_did.<apex>`, etc.; a single TXT query
 * against the apex does NOT return them, so we fan out.
 */
async function queryTxtWithArpPrefixes(doh: DohClient, apex: string) {
  const prefixes = ['', '_arp', '_did', '_didcomm', '_revocation', '_principal'];
  const results = await Promise.all(
    prefixes.map((prefix) => {
      const qname = prefix ? `${prefix}.${apex}` : apex;
      return doh.query(qname, 'TXT').catch(() => []);
    }),
  );
  return results.flat();
}

function extractLeadingLabel(recordName: string, apex: string): string {
  const stripped = recordName.replace(/\.$/, '');
  if (stripped === apex) return '';
  if (stripped.endsWith(`.${apex}`)) {
    const prefix = stripped.slice(0, -1 - apex.length);
    const first = prefix.split('.')[0];
    return first ?? '';
  }
  return stripped;
}

function unquoteTxt(data: string): string {
  // DoH JSON returns TXT data either as quoted strings (Cloudflare-style) or
  // as raw text (some implementations). Strip wrapping double-quotes when
  // present. Concatenate adjacent quoted chunks — `"foo" "bar"` → `foobar`.
  const trimmed = data.trim();
  if (!trimmed.startsWith('"')) return trimmed;
  const parts: string[] = [];
  let i = 0;
  while (i < trimmed.length) {
    if (trimmed[i] !== '"') {
      i++;
      continue;
    }
    i++;
    let buf = '';
    while (i < trimmed.length && trimmed[i] !== '"') {
      if (trimmed[i] === '\\' && i + 1 < trimmed.length) {
        buf += trimmed[i + 1];
        i += 2;
      } else {
        buf += trimmed[i];
        i++;
      }
    }
    parts.push(buf);
    i++;
  }
  return parts.join('');
}
