import type * as React from 'react';
import { cn } from './lib/cn';

export type ContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  as?: 'div' | 'section' | 'header' | 'footer' | 'main' | 'article' | 'aside' | 'nav';
};

export function Container({
  as: As = 'div',
  className,
  children,
  ...props
}: ContainerProps): React.JSX.Element {
  // A union of HTML tags, not React.ElementType: @react-three/fiber augments
  // JSX.IntrinsicElements, and an unconstrained ElementType would union in the
  // three.js elements and collapse `children` to never.
  const Component = As;
  return (
    <Component
      className={cn('mx-auto w-full max-w-page px-8', className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export function Grid12({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn('grid grid-cols-12 gap-4', className)} {...props}>
      {children}
    </div>
  );
}
