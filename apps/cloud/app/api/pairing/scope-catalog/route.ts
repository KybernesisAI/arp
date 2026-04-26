/**
 * POST /api/pairing/scope-catalog — return ScopeTemplate JSON for the given
 * scope ids so the browser's `createPairingProposal` call can compile cedar
 * policies against the same authoritative source the server uses. Wraps
 * `@kybernesis/arp-scope-catalog`'s loader (fs-backed — not safe to run in
 * the client bundle).
 *
 * Session-authed so anonymous callers can't enumerate the catalog. Response
 * is pure data: {catalog: ScopeTemplate[]} in the same order as the input
 * ids. Unknown ids are skipped.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { compileBundle } from '@kybernesis/arp-scope-catalog';
import { requireTenantDb, AuthError } from '@/lib/tenant-context';
import { getScopeCatalog } from '@/lib/catalog';

export const runtime = 'nodejs';

const Body = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  audienceDid: z.string().min(1),
  paramsMap: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    await requireTenantDb();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const catalog = getScopeCatalog();
    let compiled;
    try {
      compiled = compileBundle({
        scopeIds: parsed.data.ids,
        paramsMap: parsed.data.paramsMap ?? {},
        audienceDid: parsed.data.audienceDid,
        catalog,
      });
    } catch (err) {
      // ScopeCompileError / BundleCompileError are user-input failures
      // (missing required parameters, unknown scope ids, invalid audience
      // DID, etc.) — surface as 400 with the message so the UI can show
      // it inline instead of an uninformative 500.
      const message = err instanceof Error ? err.message : 'compile_failed';
      return NextResponse.json(
        { error: 'compile_failed', detail: message, ids: parsed.data.ids },
        { status: 400 },
      );
    }
    return NextResponse.json({
      compiled: {
        policies: compiled.policies,
        obligations: compiled.obligations,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
