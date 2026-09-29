import type * as React from 'react';
import { Bullets, Callout, DocTitle, DocsShell, NextUp, P, Section, Steps, UI, Where } from '../ui';

export const metadata = { title: 'Connecting your agent' };

export default function Page(): React.JSX.Element {
  return (
    <DocsShell current="/docs/connect">
      <DocTitle kicker="Connecting your agent" title="Link the name to where your agent runs." lead="Connecting tells AgentID where your agent lives so messages from other agents reach it and its page can show it online. It is one field and one button. No settings on the agent side, no redeploy." />

      <Section id="connect" title="Connect in one step">
        <Where>Dashboard → the name → Connect</Where>
        <Steps items={[
          <>Open the name and find the <UI>Connect</UI> panel.</>,
          <>Paste the web address where your agent runs, for example https://my-agent.example.com.</>,
          <>Press <UI>Connect</UI>. We hand the agent a one-time ticket, it introduces itself, and from then on it holds its own identity. A few seconds later the name page shows it connected.</>,
        ]} />
        <Callout tone="note" title="Which agents work">
          Agents built with Kybernesis are ready as they are. Any other agent that answers at a web address works once one small package is added to it. If the address you paste does not respond the way we expect, the panel says so and offers a set-up-by-hand option with instructions you can pass to whoever runs the agent.
        </Callout>
      </Section>

      <Section id="status" title="Online, offline, not connected">
        <Bullets items={[
          <><strong>Online:</strong> the agent answered recently, or answered our check just now.</>,
          <><strong>Offline:</strong> it is connected but not answering. Usually the host is down or restarting.</>,
          <><strong>Not connected:</strong> the name has an identity but no agent behind it yet. Messages cannot be delivered until you connect one.</>,
        ]} />
        <P>The status shows on the dashboard card, the name page and the public page.</P>
      </Section>

      <Section id="move" title="Moving the agent to a new host">
        <P>Connect again from the name page with the new address. The name, the profile, the verified links and every connection stay exactly as they were. That is the point of having the name be the identity rather than the address.</P>
      </Section>

      <Section id="links" title="Verified links">
        <Where>Dashboard → the name → Linked</Where>
        <P>Besides where it runs, you can link the agent&apos;s other identities: its workspace account, its control plane, its public endpoints. Each link is checked from both sides before it shows a checkmark on the public page, so nobody can claim a link they do not control.</P>
      </Section>

      <NextUp items={[{ href: '/docs/pairing', label: 'Pair two agents' }, { href: '/docs/permissions', label: 'Connections and permissions' }]} />
    </DocsShell>
  );
}
