import Link from 'next/link';
import { notFound } from 'next/navigation';
import type * as React from 'react';

import { SchemaTree } from '@/components/SchemaTree';
import { SCHEMA_INDEX, allSchemas, getSchema, type SchemaId } from '@/lib/schemas';

export function generateStaticParams() {
  return allSchemas().map((s) => ({ slug: s.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = SCHEMA_INDEX.find((s) => s.id === slug);
  return entry
    ? {
        title: `${entry.title} schema`,
        description: entry.description,
      }
    : { title: 'Schema not found' };
}

export default async function SchemaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.JSX.Element> {
  const { slug } = await params;
  const entry = SCHEMA_INDEX.find((s) => s.id === slug);
  const schema = getSchema(slug as SchemaId);
  if (!entry || !schema) notFound();

  const example = pickExample(schema);

  return (
    <>
      <section className="border-t border-rule">
        <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 pt-12 pb-8">
          <div className="col-span-12 flex items-center gap-3">
            <Link
              href="/schema"
              className="font-mono text-kicker uppercase tracking-[0.14em] text-muted hover:text-ink"
            >
              ← SCHEMA INDEX
            </Link>
          </div>
          <h1 className="col-span-12 mt-6 font-display text-h1 text-ink lg:col-span-9">
            {entry.title}
          </h1>
          <p className="col-span-12 mt-3 max-w-3xl font-sans text-body-lg text-ink-2 lg:col-span-8">
            {entry.description}
          </p>

          <div className="col-span-12 mt-8 flex flex-wrap gap-3 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            {schema.$id ? <span>$id: {schema.$id}</span> : null}
            <span aria-hidden>·</span>
            <a
              href={`/schema/download/${slug}`}
              className="border border-ink px-2 py-1 text-ink hover:bg-ink hover:text-paper"
            >
              DOWNLOAD JSON
            </a>
          </div>
        </div>
      </section>

      <section className="border-t border-rule">
        <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 py-12">
          <div className="col-span-12 lg:col-span-7">
            <h2 className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
              FIELDS
            </h2>
            <div className="mt-4 border border-rule bg-paper-2 p-4">
              <SchemaTree schema={schema} />
            </div>
          </div>

          <aside className="col-span-12 lg:col-span-5">
            <h2 className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
              EXAMPLE PAYLOAD
            </h2>
            <pre className="mt-4 max-h-[32rem] overflow-auto border border-rule bg-paper-2 p-4 font-mono text-[12px] leading-relaxed text-ink">
              {JSON.stringify(example, null, 2)}
            </pre>
            <p className="mt-3 font-sans text-body-sm text-ink-2">
              Examples are generated from schema metadata (examples array if
              present, otherwise a synthesised skeleton from the required
              fields). Always re-validate against the schema before shipping
              payloads.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}

/**
 * Return the schema's first `examples[]` entry if it advertises one;
 * otherwise synthesise a skeleton from the required fields so the reader
 * still sees a usable shape. Non-required fields are omitted to keep the
 * example concise.
 */
function pickExample(schema: {
  examples?: unknown[];
  required?: string[];
  properties?: Record<string, { type?: string | string[]; examples?: unknown[]; default?: unknown; const?: unknown; enum?: unknown[] }>;
}): unknown {
  if (schema.examples && schema.examples.length > 0) return schema.examples[0];
  const obj: Record<string, unknown> = {};
  if (schema.required && schema.properties) {
    for (const key of schema.required) {
      const prop = schema.properties[key];
      if (!prop) continue;
      if (prop.const !== undefined) obj[key] = prop.const;
      else if (prop.default !== undefined) obj[key] = prop.default;
      else if (prop.examples && prop.examples.length > 0) obj[key] = prop.examples[0];
      else if (prop.enum && prop.enum.length > 0) obj[key] = prop.enum[0];
      else obj[key] = skeleton(prop);
    }
  }
  return obj;
}

function skeleton(prop: { type?: string | string[] }): unknown {
  const t = Array.isArray(prop.type) ? prop.type[0] : prop.type;
  switch (t) {
    case 'string':
      return '…';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return null;
  }
}
