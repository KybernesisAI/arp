import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/cn';

const sectionVariants = cva('relative', {
  variants: {
    tone: {
      paper: 'bg-paper text-ink',
      'paper-2': 'bg-paper-2 text-ink',
      ink: 'bg-ink text-paper',
    },
    spacing: {
      tight: 'py-section-tight',
      default: 'py-section',
      loose: 'py-section-loose',
      hero: 'pt-16 pb-0',
      none: 'py-0',
    },
    rule: {
      true: 'border-t border-rule',
      false: '',
    },
  },
  defaultVariants: {
    tone: 'paper',
    spacing: 'default',
    rule: true,
  },
});

export type SectionProps = React.HTMLAttributes<HTMLElement> &
  VariantProps<typeof sectionVariants> & {
    as?: 'section' | 'div' | 'header' | 'footer' | 'main';
  };

export function Section({
  tone,
  spacing,
  rule,
  as: As = 'section',
  className,
  children,
  ...props
}: SectionProps): React.JSX.Element {
  const Component = As as React.ElementType;
  return (
    <Component
      className={cn(sectionVariants({ tone, spacing, rule }), className)}
      {...props}
    >
      {children}
    </Component>
  );
}
