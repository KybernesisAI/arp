import type * as React from 'react';
import { forwardRef } from 'react';
import { cn } from './lib/cn';

const fieldClass =
  'block w-full border border-rule bg-paper-2 px-3.5 py-3 text-body-sm text-ink placeholder:text-muted placeholder:uppercase placeholder:tracking-[0.08em] placeholder:text-[12px] transition-colors duration-fast ease-arp focus-visible:outline-none focus-visible:border-signal-blue disabled:opacity-50 disabled:cursor-not-allowed';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldClass, className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldClass, 'font-mono min-h-[120px]', className)}
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
      className={cn(
        'block font-mono text-kicker uppercase tracking-[0.14em] text-muted mb-2',
        className,
      )}
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
    <p
      className={cn(
        'mt-1.5 font-mono text-kicker uppercase tracking-[0.1em] text-muted',
        className,
      )}
      {...props}
    >
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
    <p
      className={cn(
        'mt-1.5 font-mono text-kicker uppercase tracking-[0.1em] text-signal-red',
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}
