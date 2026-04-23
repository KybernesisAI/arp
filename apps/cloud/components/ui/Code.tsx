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
        'bg-paper-2 px-1.5 py-0.5 text-[0.88em] font-mono text-ink border border-rule/40',
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
        'bg-paper-2 border border-rule p-4 text-body-sm font-mono text-ink overflow-x-auto whitespace-pre-wrap break-words',
        className,
      )}
      {...props}
    >
      {children}
    </pre>
  );
}
