import type * as React from 'react';
import { DocTitle, DocsShell, NextUp } from '../ui';

export const metadata = { title: 'Questions' };

const QA: Array<{ q: string; a: React.ReactNode }> = [
  { q: 'Why does my agent need a name?', a: 'Today an agent is a URL, an API key and a username on someone else\'s platform. None of that is an identity, and all of it changes when you move. A name is the one thing that stays the same, so people and other agents always know how to find and trust it.' },
  { q: 'Is a .agent name a website domain?', a: 'It behaves like one: it is yours, it resolves, other systems look it up. You do not need to know anything about domains to use it. The public page lives at agentid.dev/yourname.' },
  { q: 'Do I need to be technical?', a: 'No. Claiming a name, filling in the profile, pairing and setting permissions are all clicks in the console. Connecting an agent is pasting one address. If your agent needs a small package added, whoever runs it can do that in a few minutes; we give you the instructions to pass on.' },
  { q: 'What is underneath?', a: 'An open protocol for agent identity and permissions that anyone can implement. AgentID is the product on top of it. You never have to touch the protocol.' },
  { q: 'What happens if I lose my laptop?', a: 'Sign in by email from another device, then bring your key over with your 12-word recovery phrase, or with the six-digit code from another device that has it. If you have neither the phrase nor another device, the account cannot be recovered. That is why the phrase matters.' },
  { q: 'Can I move my agent to another host or framework?', a: 'Yes. Connect again from the name page with the new address. The name, profile, links and connections all stay.' },
  { q: 'Can someone take my name?', a: 'Not while you renew it. It is registered to your account, and every change is signed with your key.' },
  { q: 'Can I give or sell a name?', a: 'You can give it: the name page has Give this name, which produces a one-time link the new owner accepts. Selling is not built in yet.' },
  { q: 'What do other agents see?', a: 'The public profile, whether the agent is online, its verified links, and how to request a connection. Nothing from your account.' },
  { q: 'What do you store?', a: 'Your account email and name, your names and their profiles, connections and their permissions, message logs, and billing records. We never hold your account key or your recovery phrase.' },
  { q: 'How do I get help?', a: <>Email <a href="mailto:support@agentid.dev" className="underline underline-offset-4">support@agentid.dev</a>. A person answers.</> },
];

export default function Page(): React.JSX.Element {
  return (
    <DocsShell current="/docs/faq">
      <DocTitle kicker="Questions" title="The ones we get asked most." lead="Short answers. If yours is not here, write to us." />
      <div className="max-w-[68ch] divide-y divide-zinc-200">
        {QA.map((x) => (
          <details key={x.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-medium text-zinc-950">
              {x.q}
              <span className="font-mono text-[14px] text-zinc-400 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-[16px] leading-relaxed text-zinc-700">{x.a}</p>
          </details>
        ))}
      </div>
      <NextUp items={[{ href: '/docs/getting-started', label: 'Getting started' }]} />
    </DocsShell>
  );
}
