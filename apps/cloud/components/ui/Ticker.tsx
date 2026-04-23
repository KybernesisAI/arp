import type * as React from 'react';

export type TickerItem = [label: string, value: string];

export function Ticker({ items }: { items: TickerItem[] }): React.JSX.Element {
  // Duplicate the content once so the CSS keyframe loop is seamless.
  const doubled = [...items, ...items];
  return (
    <div className="whitespace-nowrap flex gap-9 absolute font-mono text-[11px] tracking-[0.08em] uppercase animate-ticker">
      {doubled.map((entry, idx) => (
        <span key={`${entry[0]}-${idx}`} className="inline-flex items-center gap-1.5">
          <b className="text-signal-red font-medium">{entry[0]}</b>
          <span className="text-muted">{entry[1]}</span>
        </span>
      ))}
    </div>
  );
}
