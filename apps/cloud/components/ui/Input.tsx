import type * as React from 'react';
import { forwardRef } from 'react';
import { cn } from './lib/cn';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'block w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-body-sm text-foreground-primary placeholder:text-foreground-subtle',
          'transition-colors duration-ease-out ease-out-snap',
          'focus-visible:outline-none focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-500/40',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'block w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-body-sm text-foreground-primary placeholder:text-foreground-subtle font-mono',
        'transition-colors duration-ease-out ease-out-snap',
        'focus-visible:outline-none focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-500/40',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
});

export function Label({
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>): React.JSX.Element {
  return (
    <label
      className={cn('block text-body-sm text-foreground-muted mb-2', className)}
      {...props}
    >
      {children}
    </label>
  );
}

export function FieldHint({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return (
    <p className={cn('mt-1 text-caption text-foreground-subtle', className)} {...props}>
      {children}
    </p>
  );
}

export function FieldError({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return (
    <p className={cn('mt-1 text-caption text-danger-500', className)} {...props}>
      {children}
    </p>
  );
}
