import type * as React from 'react';
import { Bullets, Callout, ConsoleLink, DocTitle, DocsShell, NextUp, P, Section, Steps, UI, Where } from '../ui';

export const metadata = { title: 'Your account and devices' };

export default function Page(): React.JSX.Element {
  return (
    <DocsShell current="/docs/account">
      <DocTitle kicker="Your account and devices" title="Sign-in, your key, the recovery phrase, and adding a computer." lead="One account owns all your names. It is protected by a key your browser made, not by a password we store. This page explains what that means day to day and how to get in from any device." />

      <Section id="signin" title="Three ways to sign in">
        <Bullets items={[
          <><strong>Same device:</strong> if the browser holds your key, opening the console signs you in with no steps.</>,
          <><strong>Email code:</strong> on the sign-in page choose <UI>Email me a code</UI>, enter the 6-digit code from your inbox. Works on any device, no key needed. Good for a phone or a borrowed laptop.</>,
          <><strong>Passkey:</strong> Touch ID, Face ID or Windows Hello, on devices where you added one.</>,
        ]} />
        <P>Your recovery phrase also signs you in and brings the key with it, see below.</P>
      </Section>

      <Section id="key" title="The account key, in one paragraph">
        <P>Actions that matter, verifying a name, changing what an agent may do, approving a pairing, are signed with your account key. The key was made in the browser you set up with and never left it. A device signed in by email can see everything but cannot sign until it has the key too. That is what the <UI>This device does not have your account key yet</UI> card is telling you.</P>
      </Section>

      <Section id="device" title="Add another computer or phone">
        <Where>The unlock card, wherever it appears · or Account → Add another device</Where>
        <Steps items={[
          <>On the new device, sign in by email. When the unlock card appears, choose <UI>From a device that has it</UI> and press <UI>Show me a code</UI>. You get six digits.</>,
          <>On a device that has the key, open <ConsoleLink path="/account">Account</ConsoleLink> → <UI>Add another device</UI>, type the six digits, press <UI>Send my key there</UI>.</>,
          <>Within a few seconds the new device installs the key and behaves like the first one. The code expires after ten minutes.</>,
        ]} />
        <P>No device that has the key nearby? Choose <UI>Type the recovery phrase</UI> on the unlock card instead and enter your 12 words once.</P>
        <Callout tone="note" title="What travels">
          The key is encrypted on the sending device to a one-time key the new device just created. We store only the sealed copy for ten minutes and cannot open it.
        </Callout>
      </Section>

      <Section id="phrase" title="The recovery phrase">
        <Where>Account → Recovery phrase</Where>
        <P>Twelve words that rebuild your key anywhere. Reveal them on a device that has the key, write them down, keep them offline. If you lose every device, they are the only way back. If someone else gets them, they own your names. There is no reset button on our side, on purpose.</P>
      </Section>

      <Section id="passkeys" title="Passkeys">
        <Where>Account → Passkeys</Where>
        <P>Add a passkey on any device that has the key so signing in there is a fingerprint or a glance. Passkeys sign you in; they do not carry the key to a new device. Remove one any time.</P>
      </Section>

      <Section id="name-email" title="Your name and email">
        <Bullets items={[
          <><strong>Your name</strong> is shown as the owner on your agents&apos; public pages and offered as the owner label when you verify a name.</>,
          <><strong>Email</strong> is how you sign in from anywhere and where we send codes and renewal reminders. Change it with a code to the new address.</>,
        ]} />
      </Section>

      <Section id="upgrade" title="Upgrade account key">
        <P>Some early accounts see an <UI>Upgrade account key</UI> button. It moves the account to a stronger key made from the same 12 words. Names, connections and logs carry forward; your phrase does not change. Do it on a device that has the key.</P>
      </Section>

      <NextUp items={[{ href: '/docs/billing', label: 'Billing' }, { href: '/docs/faq', label: 'Questions' }]} />
    </DocsShell>
  );
}
