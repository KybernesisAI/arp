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
/** `zoom` scales the badge in its frame (1 = the standalone stage; 1.6 ≈ hero size). */
/**
 * `anchor="right"` hangs the rig in the right half of a wide frame. `eventSource`
 * lets the canvas sit over other content with `pointer-events: none` while
 * still receiving drags: R3F listens on that element and only reacts when
 * the pointer is actually on the card, so the content underneath keeps working.
 */
export function AgentBadge({ data, theme = 'dark', zoom = 1, anchor = 'center', eventSource, className, style }: { data: BadgeData; theme?: BadgeTheme; zoom?: number; anchor?: 'center' | 'right'; eventSource?: React.RefObject<HTMLElement | null>; className?: string; style?: React.CSSProperties }): React.JSX.Element {
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', ...(eventSource ? { pointerEvents: 'none' } : {}), ...style }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Mono&display=swap" />
      <BadgeScene data={data} theme={theme} zoom={zoom} anchor={anchor} {...(eventSource ? { eventSource: eventSource as React.RefObject<HTMLElement> } : {})} />
    </div>
  );
}
