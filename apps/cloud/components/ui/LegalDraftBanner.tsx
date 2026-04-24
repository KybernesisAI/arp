// LEGAL-REVIEW-PENDING — rendered prominently on every /legal page until
// counsel signs off + the post-9e checklist item §0.1 flips the banner away.
import type * as React from 'react';

export function LegalDraftBanner(): React.JSX.Element {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="border-2 border-signal-red bg-paper-2 p-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-signal-red"
        />
        <span className="font-mono text-kicker uppercase tracking-[0.14em] text-signal-red">
          DRAFT — PENDING LEGAL REVIEW — DO NOT RELY ON
        </span>
      </div>
      <p className="mt-3 font-sans text-body-sm text-ink-2">
        This page is a skeleton placeholder. The final text has not been
        reviewed by counsel. No commitments made here bind ARP or Kybernesis
        until this banner is removed and the page is published under its
        final URL.
      </p>
    </div>
  );
}
