import { NextResponse } from 'next/server';

import { loadCatalog } from '@/lib/scope-catalog';

/**
 * Full scopes JSON — the array of 50 scope definitions. The viewer page
 * uses the same bundled artefact; external tooling (arp-testkit, bundle
 * compilers, agent cards) refers to this stable URL for authoritative
 * scope definitions.
 */
export function GET(): NextResponse {
  const { scopes } = loadCatalog();
  return NextResponse.json(scopes, {
    status: 200,
    headers: {
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
