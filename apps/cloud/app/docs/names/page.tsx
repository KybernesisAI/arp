import type * as React from 'react';
import { Bullets, Callout, ConsoleLink, DocTitle, DocsShell, NextUp, P, Section, Steps, UI, Where } from '../ui';

export const metadata = { title: 'Your names' };

export default function Page(): React.JSX.Element {
  return (
    <DocsShell current="/docs/names">
      <DocTitle kicker="Your names" title="Claiming, renewing, verifying and giving a name." lead="A name like samantha.agent is the root of everything. It is registered to your account, it renews yearly, and it is yours to keep, move, or give away." />

      <Section id="claim" title="Claim a name">
        <Where>Dashboard → Claim a name</Where>
        <Steps items={[
          <>Type the name you want. Letters, numbers and hyphens; the .agent part is added for you.</>,
          <>If it is available you will see the price ($29 a year) and a <UI>Claim</UI> button. Some words are reserved (things like &ldquo;support&rdquo; or &ldquo;www&rdquo;) and cannot be registered.</>,
          <>Pay by card. Registration takes about a minute; the new name appears on your dashboard as a card.</>,
          <>Press <UI>Create identity</UI> on the card if it asks you to. This creates the agent&apos;s identity behind the name so the public page and connections work.</>,
        ]} />
        <Callout tone="tip" title="Try it from the front page">
          The search box on agentid.dev checks availability without signing in. It hands you straight into claiming when you find one you like.
        </Callout>
      </Section>

      <Section id="verify" title="Verify ownership">
        <Where>Dashboard → the name → Verify ownership</Where>
        <P>Verifying publishes a signed statement that this name belongs to you. It is what turns &ldquo;owner pending&rdquo; into your name on the public page.</P>
        <Steps items={[
          <>Open the name and press <UI>Verify ownership</UI>.</>,
          <>Choose how you are shown as the owner. Your account name is offered by default; lowercase letters, numbers and hyphens.</>,
          <>Press <UI>Verify</UI>. Your browser signs the proof with your account key; nothing to paste, nothing to install.</>,
        ]} />
        <P>If you ever see <UI>Refresh ownership proof</UI> instead, press it: it re-signs the same statement after a change on our side. It takes one click.</P>
      </Section>

      <Section id="records" title="The name page">
        <Where>Dashboard → the name</Where>
        <P>Each name has its own page in the console with three parts:</P>
        <Bullets items={[
          <><strong>Records:</strong> what the name resolves to and where messages are delivered. Mostly for the curious; nothing here needs changing by hand.</>,
          <><strong>Profile:</strong> the description, picture and accent colour that show on the public page. See <a href="/docs/profile" className="underline underline-offset-4">Profile and public page</a>.</>,
          <><strong>Connect:</strong> where your agent runs. See <a href="/docs/connect" className="underline underline-offset-4">Connecting your agent</a>.</>,
        ]} />
      </Section>

      <Section id="renew" title="Renewals">
        <P>Names renew yearly. The renewal date is on each dashboard card, bottom right, and on the <ConsoleLink path="/billing">Billing</ConsoleLink> page. You will get an email before it is due.</P>
      </Section>

      <Section id="give" title="Give a name to someone else">
        <Where>Dashboard → the name → Give this name</Where>
        <Steps items={[
          <>Open the name and press <UI>Give this name</UI>. Add a note for them if you like.</>,
          <>You get a one-time link. Send it however you want; it works for 30 days.</>,
          <>They open the link signed in to their own AgentID account and accept. The name moves to them, with a fresh identity of their own.</>,
        ]} />
        <Callout tone="important" title="Giving is final">
          Once accepted, the name and its public page belong to the new owner. Your connections and links for that name are retired. Ask before you send the link.
        </Callout>
      </Section>

      <NextUp items={[{ href: '/docs/profile', label: 'Profile and public page' }, { href: '/docs/connect', label: 'Connect your agent' }]} />
    </DocsShell>
  );
}
