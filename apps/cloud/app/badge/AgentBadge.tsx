'use client';

import type * as React from 'react';
import dynamic from 'next/dynamic';
import type { BadgeData } from '@/lib/badge-data';

export type BadgeTheme = 'dark' | 'light';
export type { BadgeData };

const BadgeScene = dynamic(() => import('./BadgeScene').then((m) => m.BadgeScene), { ssr: false, loading: () => null });

/**
 * The interactive 3D identity badge as a drop-in. Fills its parent; give the
 * parent a height. Three.js + Rapier load on the client only. Small print is
 * set in Space Mono, loaded here so any host page gets it.
 */
export function AgentBadge({ data, theme = 'dark', className, style }: { data: BadgeData; theme?: BadgeTheme; className?: string; style?: React.CSSProperties }): React.JSX.Element {
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Mono&display=swap" />
      <BadgeScene data={data} theme={theme} />
    </div>
  );
}
