import { NextResponse } from 'next/server';

import { loadCatalog } from '@/lib/scope-catalog';

/**
 * Stable-URL handler for the catalog manifest. Implementers pin against
 * the checksum here; the manifest is bundled at build time so the payload
 * is identical to `@kybernesis/arp-scope-catalog/generated/manifest.json`.
 */
export function GET(): NextResponse {
  const { manifest } = loadCatalog();
  return NextResponse.json(manifest, {
    status: 200,
    headers: {
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
