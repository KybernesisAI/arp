import type * as React from 'react';
import { cn } from './lib/cn';

export type DividerProps = React.HTMLAttributes<HTMLHRElement> & {
  tone?: 'subtle' | 'default' | 'strong';
};

const toneMap: Record<NonNullable<DividerProps['tone']>, string> = {
  subtle: 'border-border-subtle',
  default: 'border-border',
  strong: 'border-border-strong',
};

export function Divider({
  tone = 'subtle',
  className,
  ...props
}: DividerProps): React.JSX.Element {
  return <hr className={cn('border-t', toneMap[tone], className)} {...props} />;
}
