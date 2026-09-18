'use client';

import type * as React from 'react';
import dynamic from 'next/dynamic';

export interface BadgeData {
  sld: string;
  name: string;
  description: string;
  did: string;
  profileUrl: string;
  mirrorHost: string;
  since: string;
  ownerVerified: boolean;
  cardSigned: boolean;
  runtime: boolean;
  links: Array<{ kind: string; value: string }>;
}

// Three.js + Rapier are browser-only; render the scene on the client after hydration.
const BadgeScene = dynamic(() => import('./BadgeScene').then((m) => m.BadgeScene), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center font-mono text-kicker uppercase text-muted">LOADING BADGE…</div>
  ),
});

export function BadgeClient({ data }: { data: BadgeData }): React.JSX.Element {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-paper text-ink">
      <div className="pointer-events-none absolute left-0 right-0 top-16 z-10 flex items-baseline justify-between px-6 py-5 font-mono text-kicker uppercase text-muted">
        <span>AGENT ID · BADGE</span>
        <span>DRAG THE BADGE · {data.sld}.agent</span>
      </div>
      <BadgeScene data={data} />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex items-baseline justify-between px-6 py-5 font-mono text-kicker uppercase text-muted">
        <a href={data.profileUrl} className="pointer-events-auto underline decoration-rule hover:decoration-ink">
          {data.profileUrl.replace(/^https:\/\//, '')}
        </a>
        <span>SINCE {data.since}</span>
      </div>
    </div>
  );
}
