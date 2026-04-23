import type * as React from 'react';
import { cn } from './lib/cn';

type Width = 'sm' | 'md' | 'lg' | 'xl' | 'wide';

const widthMap: Record<Width, string> = {
  sm: 'max-w-container-sm',
  md: 'max-w-container-md',
  lg: 'max-w-container-lg',
  xl: 'max-w-container-xl',
  wide: 'max-w-container-wide',
};

export type ContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  width?: Width;
  as?: keyof React.JSX.IntrinsicElements;
};

export function Container({
  width = 'lg',
  as: As = 'div',
  className,
  children,
  ...props
}: ContainerProps): React.JSX.Element {
  const Component = As as React.ElementType;
  return (
    <Component
      className={cn('mx-auto w-full px-6 sm:px-6 lg:px-8', widthMap[width], className)}
      {...props}
    >
      {children}
    </Component>
  );
}
