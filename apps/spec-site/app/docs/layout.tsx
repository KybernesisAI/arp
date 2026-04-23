import type * as React from 'react';

import { DocShell } from '@/components/DocShell';
import { DOCS_NAV } from '@/lib/doc-nav';

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <DocShell groups={DOCS_NAV}>{children}</DocShell>;
}
