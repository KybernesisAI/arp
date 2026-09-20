'use client';

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { AgentBadge, type BadgeData } from '@/app/badge/AgentBadge';

/**
 * Black hero with the 3D identity badge hanging in the right column.
 *
 * Wide (lg+): the physics rig covers the whole hero and anchors at the
 * measured centre of the right column, so the badge can be flung anywhere in
 * the hero but never starts over the copy. Narrow: the badge lives in its own
 * block under the copy. `children` is the left-column content (server
 * rendered is fine).
 */
export function BadgeHero({ badge, children, zoom = 1.7, narrowZoom = 1.35, minHeight = 'lg:h-[760px]' }: { badge: BadgeData; children: React.ReactNode; zoom?: number; narrowZoom?: number; minHeight?: string }): React.JSX.Element {
  const heroRef = useRef<HTMLElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(false);
  const [anchorX, setAnchorX] = useState(0.75);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  useEffect(() => {
    const hero = heroRef.current, slot = slotRef.current;
    if (!hero || !slot) return;
    const measure = () => {
      const h = hero.getBoundingClientRect(), r = slot.getBoundingClientRect();
      if (h.width > 0) setAnchorX((r.left + r.width / 2 - h.left) / h.width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hero); ro.observe(slot);
    return () => ro.disconnect();
  }, [wide]);

  return (
    <section ref={heroRef} className="relative overflow-hidden bg-black text-white">
      {wide && (
        <div className="absolute inset-0 z-0">
          <AgentBadge data={badge} theme="dark" zoom={zoom} anchorX={anchorX} eventSource={heroRef} />
        </div>
      )}
      <div className="relative z-[1] mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-8 px-6 pb-8 pt-16 lg:grid-cols-12 lg:pb-0 lg:pt-8" style={{ pointerEvents: wide ? 'none' : 'auto' }}>
        <div className="lg:col-span-6 lg:py-24" style={{ pointerEvents: 'auto' }}>{children}</div>
        <div ref={slotRef} className={`relative h-[560px] w-full lg:col-span-6 ${minHeight}`}>
          {!wide && <AgentBadge data={badge} theme="dark" zoom={narrowZoom} />}
        </div>
      </div>
    </section>
  );
}
