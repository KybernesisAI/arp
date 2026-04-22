import { createHash } from 'node:crypto';
import {
  ScopeCatalogManifestSchema,
  type ScopeCatalogManifest,
  type ScopeTemplate,
} from '@kybernesis/arp-spec';

/**
 * Deterministically canonicalize a value for checksum computation.
 *
 * We implement a minimal RFC 8785 JCS subset here (objects sorted by key,
 * arrays in order, primitives as JSON.stringify encodes them) rather than
 * pulling in the `canonicalize` dep — the catalog only needs this inside the
 * build step, and we control the inputs. Phase 2 (which actually signs
 * canonicalized payloads) will import `canonicalize` properly.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('canonicalize: non-finite numbers are not allowed');
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return `{${parts.join(',')}}`;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export interface BuildManifestOptions {
  /** Catalog version label, default "v1". */
  version?: string;
  /**
   * `updated_at` timestamp. When computing deterministic checksums, pass a
   * fixed ISO string. Defaults to the current time.
   */
  updatedAt?: string;
}

/**
 * Build a `ScopeCatalogManifest` from a list of scope templates. The checksum
 * covers the sorted scopes array (not the top-level metadata) so it is
 * stable across re-runs with different `updated_at` values but identical
 * scope content.
 */
export function buildCatalogManifest(
  scopes: readonly ScopeTemplate[],
  options: BuildManifestOptions = {}
): ScopeCatalogManifest {
  const sorted = [...scopes].sort((a, b) => a.id.localeCompare(b.id));
  const canonical = canonicalize(sorted);
  const checksum = `sha256:${sha256Hex(canonical)}`;

  const manifest = {
    version: options.version ?? 'v1',
    updated_at: options.updatedAt ?? new Date().toISOString(),
    scope_count: sorted.length,
    checksum,
    scopes: sorted,
  };

  const parsed = ScopeCatalogManifestSchema.parse(manifest);
  return parsed;
}
