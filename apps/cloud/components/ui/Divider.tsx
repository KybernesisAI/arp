import type * as React from 'react';
import { cn } from './lib/cn';

export type DividerProps = React.HTMLAttributes<HTMLHRElement>;

export function Divider({ className, ...props }: DividerProps): React.JSX.Element {
  return (
    <hr className={cn('border-0 border-t border-rule', className)} {...props} />
  );
}
