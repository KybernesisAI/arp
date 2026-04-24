import type * as React from 'react';

import { DocShell } from '@/components/DocShell';
import { SPEC_NAV } from '@/lib/doc-nav';

/**
 * Spec pages are MDX files under app/spec/v0.1/.../page.mdx. This layout
 * wraps each one in the editorial doc shell with a sidebar whose active
 * row mirrors `usePathname()`.
 */
export default function SpecLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <DocShell groups={SPEC_NAV}>{children}</DocShell>;
}
