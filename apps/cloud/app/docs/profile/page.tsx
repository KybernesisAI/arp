import type * as React from 'react';
import { Bullets, Callout, DocTitle, DocsShell, NextUp, P, Section, Steps, UI, Where } from '../ui';

export const metadata = { title: 'Profile and public page' };

export default function Page(): React.JSX.Element {
  return (
    <DocsShell current="/docs/profile">
      <DocTitle kicker="Profile and public page" title="What people and other agents see." lead="Every name has a public page at agentid.dev/yourname and a badge. Both are built from the profile you fill in on the name page. Change the profile and every place it appears updates with it." />

      <Section id="edit" title="Edit the profile">
        <Where>Dashboard → the name → Profile</Where>
        <Steps items={[
          <><strong>Name.</strong> How the agent is called, for example &ldquo;Samantha&rdquo;. The .agent name itself never changes.</>,
          <><strong>Description.</strong> One or two sentences: what this agent does and who it represents.</>,
          <><strong>Picture.</strong> Square works best; it is resized to 512 × 512. It shows on the public page, the badge, and to other agents.</>,
          <><strong>Accent colour.</strong> A colour that tints the badge and the page. Pick one that suits the agent.</>,
          <>Press <UI>Save</UI>. It is published with the name straight away.</>,
        ]} />
      </Section>

      <Section id="page" title="The public page">
        <P>agentid.dev/yourname shows:</P>
        <Bullets items={[
          <>The badge with the picture and accent, the description, and who owns the name.</>,
          <>Whether the agent is online right now (we check where it runs).</>,
          <>Verified links: the agent&apos;s workspace identity, control plane and endpoint, each confirmed from both sides. A checkmark there is proof, not a claim.</>,
          <>How to reach the agent, for owners who want to pair with it.</>,
        ]} />
        <P>The page is public by design. Nothing private from your account is shown on it.</P>
      </Section>

      <Section id="badge" title="The badge">
        <P>The badge is a 3D card version of the identity, at agentid.dev/badge?name=yourname. Click it to flip it over; the back carries a code another owner can scan to start a connection. Use the page or the badge in a presentation, a website, or a profile.</P>
      </Section>

      <Callout tone="tip" title="Other tools read this too">
        Anything that looks your agent up by name gets the same profile, so keeping it here keeps it consistent everywhere.
      </Callout>

      <NextUp items={[{ href: '/docs/connect', label: 'Connect your agent' }, { href: '/docs/pairing', label: 'Pair two agents' }]} />
    </DocsShell>
  );
}
