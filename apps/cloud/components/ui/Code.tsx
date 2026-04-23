import type * as React from 'react';
import { cn } from './lib/cn';

export function Code({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>): React.JSX.Element {
  return (
    <code
      className={cn(
        'rounded-sm bg-surface-elevated px-1.5 py-0.5 text-[0.85em] font-mono text-foreground-primary border border-border-subtle',
        className,
      )}
      {...props}
    >
      {children}
    </code>
  );
}

export function Pre({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLPreElement>): React.JSX.Element {
  return (
    <pre
      className={cn(
        'rounded-lg border border-border-subtle bg-surface-raised p-4 text-body-sm font-mono text-foreground-primary overflow-x-auto whitespace-pre-wrap break-all',
        className,
      )}
      {...props}
    >
      {children}
    </pre>
  );
}
