/**
 * Shared test fixtures for the Phase-10a pairing route tests.
 *
 * Keeps slow-ish catalog loads out of each test's hot path (pnpm's
 * per-test-file worker lifetime means we amortise the YAML read across
 * all specs in the file) and mirrors the helper pattern already established
 * for cookie/session mocks.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadScopesFromDirectory as loadFromDir,
} from '@kybernesis/arp-scope-catalog';
import { ed25519PublicKeyToDidKey as didKeyEncode } from '@kybernesis/arp-resolver';
import type { ScopeTemplate } from '@kybernesis/arp-spec';

export function ed25519PublicKeyToDidKey(raw: Uint8Array): string {
  return didKeyEncode(raw);
}

const HERE = dirname(fileURLToPath(import.meta.url));

/** Resolve the repo-relative scope catalog directory. */
export function loadScopesFromDirectory(): readonly ScopeTemplate[] {
  return loadFromDir(
    resolve(HERE, '..', '..', '..', '..', 'packages', 'scope-catalog', 'scopes'),
  );
}
