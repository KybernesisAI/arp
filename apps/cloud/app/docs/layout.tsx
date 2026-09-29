import type { Metadata } from 'next';
import type * as React from 'react';

export const metadata: Metadata = {
  title: { default: 'Help & guides · AgentID', template: '%s · AgentID docs' },
  description: 'How to claim a name, connect your agent, pair it with others and stay in control. Written for owners, not engineers.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <>{children}</>;
}
