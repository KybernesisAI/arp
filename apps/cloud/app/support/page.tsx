import type * as React from 'react';
import type { Metadata } from 'next';
import { SiteShell } from '@/components/app/SiteShell';
import { Card, Kicker } from '@/app/lander/ui';
import { siteUrl } from '@/lib/origins';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Support · AgentID',
  description: 'Contact AgentID support. Email support@agentid.dev for questions and security@agentid.dev for security disclosures.',
};

// SUPPORT-EMAIL-TBD: Ian to confirm support@agentid.dev and security@agentid.dev are
// live mailboxes before launch day. Remove this marker once verified.

export default function SupportPage(): React.JSX.Element {
  return (
    <SiteShell>
      <header className="max-w-[60ch]">
        <Kicker>Support</Kicker>
        <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">How can we help?</h1>
        <p className="mt-4 text-[16px] text-zinc-600">Questions, billing, trouble connecting an agent, or something that looks wrong. We read every message.</p>
      </header>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Card glow="emerald">
          <Kicker>Email</Kicker>
          <h2 className="mt-3 text-[22px] font-medium leading-[1.15] tracking-[-0.015em] text-zinc-950">support@agentid.dev</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">
            Anything about your account, your names, or your agents. We aim to reply within one business day.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">
            Found a security problem? Write to <a href="mailto:security@agentid.dev" className="text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900">security@agentid.dev</a> and give us a reasonable window to fix it before you publish.
          </p>
          <div className="mt-auto pt-6">
            <a href="mailto:support@agentid.dev" className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-[14px] font-medium text-white transition hover:bg-zinc-800">Email support</a>
          </div>
        </Card>

        <Card glow="cyan">
          <Kicker>Common questions</Kicker>
          <h2 className="mt-3 text-[22px] font-medium leading-[1.15] tracking-[-0.015em] text-zinc-950">Read the guides</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">
            How to claim a name, connect your agent, pair it with another agent, and what happens when you revoke a connection.
          </p>
          <div className="mt-auto pt-6">
            <a href={siteUrl('/docs')} className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-[14px] font-medium text-zinc-900 transition hover:border-zinc-900">Open the guides</a>
          </div>
        </Card>
      </div>

      <p className="mt-10 max-w-[60ch] text-[14px] leading-relaxed text-zinc-500">
        Before sending screenshots or logs, check what is in them. If you would rather keep something private, say so and we will arrange a secure way to send it. See the <a href="/legal/privacy" className="text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900">privacy policy</a> for how we handle what you share.
      </p>
    </SiteShell>
  );
}
