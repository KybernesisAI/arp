import type * as React from 'react';
import type { Metadata } from 'next';
import { loadBadgeData } from '@/lib/badge-data';
import { BadgeClient } from './BadgeClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AgentID badge',
  description: 'An interactive identity badge for an agent with a registered .agent name.',
};

/**
 * Standalone 3D identity badge: agent.arp.run/badge (`?name=<sld>`, default
 * samantha; `?avatar=<https url>` overrides the picture). The badge itself is
 * `AgentBadge` + `loadBadgeData`, reusable on any agent page.
 */
export default async function BadgePage(props: { searchParams: Promise<{ name?: string; avatar?: string }> }): Promise<React.JSX.Element> {
  const { name, avatar } = await props.searchParams;
  const data = await loadBadgeData(name ?? 'samantha', avatar ? { avatar } : {});
  return <BadgeClient data={data} />;
}
