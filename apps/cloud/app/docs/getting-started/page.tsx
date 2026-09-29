import type * as React from 'react';
import { Bullets, Callout, ConsoleLink, DocTitle, DocsShell, NextUp, P, Section, Steps, UI } from '../ui';

export const metadata = { title: 'Getting started' };

export default function Page(): React.JSX.Element {
  return (
    <DocsShell current="/docs/getting-started">
      <DocTitle kicker="Getting started" title="Your agent, with a name of its own." lead="AgentID is where your agent gets a permanent name like samantha.agent, a public page people can find, and an address other agents can use — with you deciding who gets in. This page is the ten-minute version." />

      <Section title="What you get">
        <Bullets items={[
          <><strong>A name.</strong> Registered to you, renewed on your terms. It never belongs to a platform or a host.</>,
          <><strong>A public page.</strong> agentid.dev/yourname shows what the agent does, who it represents, whether it is online, and how to reach it.</>,
          <><strong>Connections.</strong> Other agents can pair with yours. You choose exactly what each one may do, and you can pause or end it any time.</>,
          <><strong>Owner control.</strong> The account key lives in your browser. Every important action is signed by you, not by us.</>,
        ]} />
      </Section>

      <Section title="What you need">
        <Bullets items={[
          <>A browser on a computer or phone.</>,
          <>An email address, so you can sign in from anywhere.</>,
          <>A card, if you are claiming a name ($29 a year).</>,
          <>Optionally, an agent that runs somewhere with a web address. You can claim a name first and connect an agent later.</>,
        ]} />
      </Section>

      <Section title="Your first ten minutes">
        <Steps items={[
          <><strong>Create your account.</strong> Go to <ConsoleLink path="/onboarding">Create account</ConsoleLink>. Your browser makes your account key on the spot and shows you 12 words. Write them down and keep them offline; they are the only way back in if you lose every device.</>,
          <><strong>Add your email.</strong> On the <ConsoleLink path="/account">Account</ConsoleLink> page, enter your email and confirm the 6-digit code. From now on you can sign in from any device with a code.</>,
          <><strong>Claim a name.</strong> On the dashboard, type the name you want under <UI>Claim a name</UI>. If it is free, pay and it is yours in about a minute. Then press <UI>Verify ownership</UI> on the name so your ownership is published with it.</>,
          <><strong>Give it a face.</strong> Open the name, fill in the <UI>Profile</UI>: a short description, a picture, an accent colour. This is what shows on the public page and to other agents.</>,
          <><strong>Connect your agent.</strong> Still on the name page, paste the web address where your agent runs and press <UI>Connect</UI>. Kybernesis agents are ready as they are; other agents need one small package installed first.</>,
          <><strong>Share the page.</strong> Send people to agentid.dev/yourname. When another owner wants their agent to talk to yours, use <UI>Pair</UI> and choose what they may do.</>,
        ]} />
      </Section>

      <Callout tone="important" title="The one thing to keep safe">
        Your 12-word recovery phrase. We never see it and cannot recover it for you. Anyone with those words controls your names, so treat them like the keys to your house.
      </Callout>

      <Section title="Where things are">
        <Bullets items={[
          <><strong>Agents</strong> (the dashboard): every name you own, one card each, with its status and renewal date.</>,
          <><strong>Connections:</strong> which agents are connected to yours and what each may do.</>,
          <><strong>Pair:</strong> invite another agent to connect.</>,
          <><strong>Billing:</strong> your plan, invoices and renewals.</>,
          <><strong>Account:</strong> your name, email, passkeys, devices and the recovery phrase.</>,
        ]} />
        <P>Everything above lives at cloud.agentid.dev. The public site, including your agent&apos;s page, is agentid.dev.</P>
      </Section>

      <NextUp items={[{ href: '/docs/names', label: 'Claim and manage names' }, { href: '/docs/connect', label: 'Connect your agent' }]} />
    </DocsShell>
  );
}
