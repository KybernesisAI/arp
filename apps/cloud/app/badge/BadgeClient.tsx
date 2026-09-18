'use client';

import type * as React from 'react';
import { useState } from 'react';
import dynamic from 'next/dynamic';

export interface BadgeData {
  sld: string;
  name: string;
  description: string;
  did: string;
  profileUrl: string;
  connectUrl: string;
  mirrorHost: string;
  a2aEndpoint: string;
  since: string;
  ownerVerified: boolean;
  ownerLabel: string | null;
  cardSigned: boolean;
  runtime: boolean;
  avatarUrl: string;
  links: Array<{ kind: string; value: string }>;
}

export type BadgeTheme = 'dark' | 'light';

const BadgeScene = dynamic(() => import('./BadgeScene').then((m) => m.BadgeScene), { ssr: false, loading: () => null });

/** Plain stage: black (or white) page, the badge, a theme switch. Nothing else. */
export function BadgeClient({ data }: { data: BadgeData }): React.JSX.Element {
  const [theme, setTheme] = useState<BadgeTheme>('dark');
  const dark = theme === 'dark';
  const fg = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
  return (
    <div style={{ position: 'relative', height: '100dvh', width: '100%', overflow: 'hidden', background: dark ? '#000' : '#fff', color: fg, fontFamily: 'Inter, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif', transition: 'background 300ms ease' }}>
      <div style={{ position: 'absolute', top: 20, left: 24, right: 24, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', pointerEvents: 'none' }}>
        <span>AgentID</span>
        <button
          type="button"
          onClick={() => setTheme(dark ? 'light' : 'dark')}
          style={{ pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: `1px solid ${dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'}`, color: fg, borderRadius: 999, padding: '6px 12px', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
          aria-label="Switch background"
        >
          <span style={{ width: 28, height: 16, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', position: 'relative', display: 'inline-block' }}>
            <span style={{ position: 'absolute', top: 2, left: dark ? 2 : 14, width: 12, height: 12, borderRadius: 999, background: dark ? '#fff' : '#000', transition: 'left 200ms ease' }} />
          </span>
          {dark ? 'Light' : 'Dark'}
        </button>
      </div>
      <BadgeScene data={data} theme={theme} />
      <div style={{ position: 'absolute', bottom: 20, left: 24, right: 24, zIndex: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', pointerEvents: 'none' }}>
        <a href={data.profileUrl} style={{ pointerEvents: 'auto', color: fg, textDecoration: 'none' }}>
          {data.sld}.agent
        </a>
        <span>Drag · click to flip</span>
      </div>
    </div>
  );
}
