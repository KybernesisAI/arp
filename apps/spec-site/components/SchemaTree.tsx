'use client';

import { useState } from 'react';
import type * as React from 'react';

import { cn } from '@/lib/cn';
import type { JsonSchema } from '@/lib/schemas';

export type SchemaTreeProps = {
  schema: JsonSchema;
};

export function SchemaTree({ schema }: SchemaTreeProps): React.JSX.Element {
  return (
    <div className="font-mono text-body-sm">
      <SchemaNode schema={schema} name="" required depth={0} />
    </div>
  );
}

function SchemaNode({
  schema,
  name,
  required,
  depth,
}: {
  schema: JsonSchema;
  name: string;
  required: boolean;
  depth: number;
}): React.JSX.Element {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren =
    (schema.properties && Object.keys(schema.properties).length > 0) ||
    Array.isArray(schema.items) ||
    (schema.items && typeof schema.items === 'object');
  const typeLabel = formatType(schema);

  return (
    <div
      className={cn('border-l border-rule pl-3', depth === 0 && 'border-none pl-0')}
    >
      <button
        type="button"
        onClick={() => hasChildren && setOpen((v) => !v)}
        className={cn(
          'flex w-full items-baseline gap-2 py-1 text-left',
          hasChildren ? 'cursor-pointer hover:bg-paper-2' : 'cursor-default',
        )}
      >
        {hasChildren ? (
          <span className="text-muted">{open ? '−' : '+'}</span>
        ) : (
          <span className="text-muted">·</span>
        )}
        {name ? (
          <span
            className={cn(
              'text-ink',
              required ? 'font-medium' : 'text-ink-2',
            )}
          >
            {name}
            {required ? <span className="text-signal-red">*</span> : null}
          </span>
        ) : null}
        <span className="text-muted">{typeLabel}</span>
        {schema.format ? (
          <span className="text-muted">· {schema.format}</span>
        ) : null}
        {schema.enum ? (
          <span className="truncate text-muted">
            · enum({schema.enum.length})
          </span>
        ) : null}
      </button>

      {schema.description ? (
        <div className="mb-1 ml-6 font-sans text-body-sm text-ink-2">
          {schema.description}
        </div>
      ) : null}

      {schema.enum && schema.enum.length > 0 ? (
        <div className="mb-1 ml-6 flex flex-wrap gap-1">
          {schema.enum.slice(0, 24).map((v, i) => (
            <span
              key={`${String(v)}-${i}`}
              className="border border-rule bg-paper-2 px-1.5 py-0.5 text-[10px] text-ink-2"
            >
              {JSON.stringify(v)}
            </span>
          ))}
          {schema.enum.length > 24 ? (
            <span className="text-[10px] text-muted">
              +{schema.enum.length - 24} more
            </span>
          ) : null}
        </div>
      ) : null}

      {schema.pattern ? (
        <div className="mb-1 ml-6 font-mono text-[11px] text-muted">
          pattern: <span className="text-ink-2">{schema.pattern}</span>
        </div>
      ) : null}

      {open && hasChildren ? (
        <div className="ml-2">
          {schema.properties
            ? Object.entries(schema.properties).map(([key, sub]) => (
                <SchemaNode
                  key={key}
                  name={key}
                  schema={sub}
                  required={schema.required?.includes(key) ?? false}
                  depth={depth + 1}
                />
              ))
            : null}
          {schema.items && !Array.isArray(schema.items) ? (
            <SchemaNode
              schema={schema.items}
              name="[]"
              required
              depth={depth + 1}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatType(schema: JsonSchema): string {
  if (schema.const !== undefined) return `const: ${JSON.stringify(schema.const)}`;
  if (schema.type) {
    const t = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type;
    if (t === 'array' && schema.items && !Array.isArray(schema.items)) {
      const inner = formatType(schema.items);
      return `array<${inner}>`;
    }
    return t;
  }
  if (schema.oneOf) return `oneOf(${schema.oneOf.length})`;
  if (schema.anyOf) return `anyOf(${schema.anyOf.length})`;
  if (schema.allOf) return `allOf(${schema.allOf.length})`;
  return '—';
}
