import type * as React from 'react';
import { Kicker } from '@/app/lander/ui';

/**
 * Shared pieces for the three legal documents: the page header (kicker,
 * title, last-updated line) and a numbered section. Body copy is plain
 * markup; the wrapper styles paragraphs, lists and sub-headings so each
 * document only writes its text.
 */
export function LegalHeader({ title, updated }: { title: string; updated: string }): React.JSX.Element {
  return (
    <header className="max-w-[72ch]">
      <Kicker>Legal</Kicker>
      <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">{title}</h1>
      <div className="mt-4 font-mono text-[12px] uppercase tracking-[0.16em] text-zinc-500">Last updated {updated}</div>
    </header>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="max-w-[72ch] border-t border-zinc-200 pt-8">
      <h2 className="text-[22px] font-medium leading-[1.15] tracking-[-0.015em] text-zinc-950">{title}</h2>
      <div className="text-[16px] leading-relaxed text-zinc-700 [&_a]:underline [&_a]:decoration-zinc-300 [&_a]:underline-offset-4 hover:[&_a]:decoration-zinc-900 [&_code]:font-mono [&_code]:text-[14px] [&_code]:text-zinc-900 [&_h3]:mt-5 [&_h3]:text-[16px] [&_h3]:font-medium [&_h3]:text-zinc-950 [&_li]:pl-1 [&_p]:mt-3 [&_strong]:font-medium [&_strong]:text-zinc-950 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
