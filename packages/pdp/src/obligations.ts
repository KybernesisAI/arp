import type { Obligation } from '@kybernesis/arp-spec';

export interface ParsedObligationPolicy {
  /** Auto-generated stable id assigned to the cleaned-up policy text. */
  id: string;
  /** Obligation `type` from `@obligation("...")`. */
  obligationType: string;
  /** Parsed params from `@obligation_params(...)` (object, JSON string, or empty). */
  params: Record<string, unknown>;
  /** Policy text with ARP-specific annotations removed, safe for Cedar. */
  cleanedText: string;
}

/**
 * Parse ARP's non-standard obligation annotations out of a Cedar policy.
 *
 * Accepted forms:
 *
 *   @obligation("redact_fields")
 *   @obligation_params({ "fields": ["client.name"] })      // object literal
 *   @obligation_params("{\"fields\":[...]}")               // JSON string
 *
 * The returned `cleanedText` has both annotations removed and is safe to pass
 * straight to Cedar. Auto-prefixes an `@id(...)` so callers can track the
 * policy's `policies_fired` id.
 */
export function parseObligationPolicy(
  text: string,
  fallbackId: string,
): ParsedObligationPolicy {
  const { type, rest: afterType } = extractObligationType(text);
  const { params, rest: afterParams } = extractObligationParams(afterType);
  const existingId = extractExistingId(afterParams);
  const cleaned = afterParams.trim();
  const id = existingId ?? fallbackId;
  const withId = existingId ? cleaned : `@id("${id}")\n${cleaned}`;
  return {
    id,
    obligationType: type,
    params,
    cleanedText: withId,
  };
}

function extractObligationType(text: string): { type: string; rest: string } {
  const match = /@obligation\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\)/m.exec(text);
  if (!match) {
    throw new Error(
      'obligation policy missing @obligation("<type>") annotation',
    );
  }
  const rest = text.slice(0, match.index) + text.slice(match.index + match[0].length);
  return { type: match[1] ?? '', rest };
}

function extractObligationParams(
  text: string,
): { params: Record<string, unknown>; rest: string } {
  const headIdx = text.indexOf('@obligation_params');
  if (headIdx < 0) return { params: {}, rest: text };

  // Find the opening paren after the keyword.
  const parenIdx = text.indexOf('(', headIdx);
  if (parenIdx < 0) return { params: {}, rest: text };

  // Walk forward balancing braces/quotes to find the matching close paren.
  let depth = 1;
  let inString: '"' | "'" | null = null;
  let i = parenIdx + 1;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      i++;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    if (depth === 0 && ch === ')') break;
    i++;
  }
  if (depth !== 0) {
    throw new Error('unbalanced @obligation_params annotation');
  }

  const innerRaw = text.slice(parenIdx + 1, i).trim();
  const rest = text.slice(0, headIdx) + text.slice(i + 1);
  const params = parseParamValue(innerRaw);
  return { params, rest };
}

function parseParamValue(raw: string): Record<string, unknown> {
  if (!raw) return {};
  // If the whole value is a quoted string, it's a JSON-stringified payload.
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    const unquoted = raw.slice(1, -1).replace(/\\(.)/g, '$1');
    try {
      const parsed = JSON.parse(unquoted);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      throw new Error('expected object');
    } catch (err) {
      throw new Error(
        `@obligation_params string payload isn't valid JSON object: ${(err as Error).message}`,
      );
    }
  }
  // Otherwise treat as a direct JSON5-ish object literal — standardise quotes.
  const normalised = coerceToJson(raw);
  try {
    const parsed = JSON.parse(normalised);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error('expected object');
  } catch (err) {
    throw new Error(
      `@obligation_params payload isn't a valid JSON object (after coercion): ${raw}: ${(err as Error).message}`,
    );
  }
}

/**
 * Light JSON coercion for the Cedar annotation param form. Converts
 * single-quoted strings to double-quoted, and unquoted object keys to quoted.
 * Good enough for the param shapes in ARP-policy-examples.md §5 — not a full
 * JSON5 parser.
 */
function coerceToJson(raw: string): string {
  let out = raw.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, inner: string) => {
    return JSON.stringify(inner);
  });
  // Quote bare keys: {{ foo: ... }} → {{ "foo": ... }}
  out = out.replace(
    /([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g,
    (_m, lead: string, key: string, tail: string) => `${lead}"${key}"${tail}`,
  );
  return out;
}

function extractExistingId(text: string): string | null {
  const match = /@id\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\)/m.exec(text);
  return match ? (match[1] ?? null) : null;
}

export function obligationRecord(parsed: ParsedObligationPolicy): Obligation {
  return { type: parsed.obligationType, params: parsed.params };
}
