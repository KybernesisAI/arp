import { NextResponse } from 'next/server';

import { allSchemas, getSchema, type SchemaId } from '@/lib/schemas';

export function generateStaticParams() {
  return allSchemas().map((s) => ({ slug: s.id }));
}

/**
 * Stable JSON download URL — `/schema/download/<id>` returns the raw
 * schema with `content-disposition: attachment` so downloads name the
 * file correctly. External tools that want to pin against a schema URL
 * (validators, registry agents) use this path.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const schema = getSchema(slug as SchemaId);
  if (!schema) {
    return new NextResponse('Not found', { status: 404 });
  }
  return new NextResponse(JSON.stringify(schema, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/schema+json',
      'content-disposition': `attachment; filename="${slug}.json"`,
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
