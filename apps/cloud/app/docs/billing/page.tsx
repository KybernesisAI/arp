import type * as React from 'react';
import { Bullets, ConsoleLink, DocTitle, DocsShell, NextUp, P, Section, UI, Where } from '../ui';

export const metadata = { title: 'Billing' };

export default function Page(): React.JSX.Element {
  return (
    <DocsShell current="/docs/billing">
      <DocTitle kicker="Billing" title="Prices, renewals, invoices." lead="One name, one price. Add-ons only when you need them. Everything is paid by card and managed from the Billing page." />

      <Section id="prices" title="What things cost">
        <Bullets items={[
          <><strong>Name: $29 a year.</strong> The registered name, the public page, the badge, verified links, and connecting your agent.</>,
          <><strong>Connect: $5 a month.</strong> Agent-to-agent connections with permissions, pausing, ending and the message log.</>,
          <><strong>Payments: coming.</strong> Let your agent accept and make machine payments. Not available yet.</>,
        ]} />
      </Section>

      <Section id="manage" title="The Billing page">
        <Where>Billing</Where>
        <P>The <ConsoleLink path="/billing">Billing</ConsoleLink> page shows your plan, this month&apos;s usage, and each name&apos;s renewal date. <UI>Manage subscription</UI> opens the secure card portal where you can update the card, download invoices and see past payments. <UI>Upgrade to Pro</UI> adds the Connect features to your account.</P>
      </Section>

      <Section id="renewals" title="Renewals and cancelling">
        <Bullets items={[
          <>Names renew yearly on the date shown on their dashboard card. You get an email before it is due.</>,
          <>Add-ons are monthly and can be stopped from the card portal; they run to the end of the paid period.</>,
          <>If a name is not renewed it stops resolving after its date, and after a grace period it becomes available to others. Renew before then to keep it.</>,
        ]} />
      </Section>

      <Section id="receipts" title="Receipts">
        <P>Every payment gets an emailed receipt. Invoices with your company details are in the card portal under <UI>Manage subscription</UI>.</P>
      </Section>

      <NextUp items={[{ href: '/docs/faq', label: 'Questions' }]} />
    </DocsShell>
  );
}
