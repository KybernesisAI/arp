import type * as React from 'react';
import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { Card, Code, Link, PlateHead } from '@/components/ui';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Support — ARP Cloud',
  description:
    'Contact ARP Cloud support. Email support@arp.run for questions + security@arp.run for security disclosures.',
};

// SUPPORT-EMAIL-TBD: Ian to confirm support@arp.run and security@arp.run are
// live mailboxes before launch day. Remove this marker once verified.

export default function SupportPage(): React.JSX.Element {
  return (
    <AppShell showMainActions={false}>
      <PlateHead
        plateNum="S.00"
        kicker="// CONTACT · SUPPORT"
        title="Contact support"
      />

      <div className="max-w-3xl">
        <p className="text-body text-ink-2">
          For issues, questions, or security disclosures, email us. We read
          every message.
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-px bg-rule border border-rule">
          <Card tone="paper" padded className="border-0">
            <div className="font-mono text-kicker uppercase text-muted">
              // GENERAL SUPPORT
            </div>
            <h2 className="mt-2 font-display font-medium text-h3">
              support@arp.run
            </h2>
            <p className="mt-4 text-body-sm text-ink-2">
              Product questions, billing, pairing help, or anything that isn't
              a security issue. Response target: one business day.
            </p>
            <div className="mt-4">
              <Link href="mailto:support@arp.run" variant="accent">
                Open in mail client →
              </Link>
            </div>
          </Card>

          <Card tone="paper-2" padded className="border-0">
            <div className="font-mono text-kicker uppercase text-muted">
              // SECURITY DISCLOSURES
            </div>
            <h2 className="mt-2 font-display font-medium text-h3">
              security@arp.run
            </h2>
            <p className="mt-4 text-body-sm text-ink-2">
              Suspected vulnerabilities, cryptographic concerns, or anything
              that could affect other users. We follow a coordinated-disclosure
              policy: please give us a reasonable window to patch before public
              disclosure.
            </p>
            <div className="mt-4">
              <Link href="mailto:security@arp.run" variant="accent">
                Open in mail client →
              </Link>
            </div>
          </Card>
        </div>

        <section className="mt-12">
          <h2 className="font-display font-medium text-h3 mb-4 pb-3 border-b border-rule">
            Other resources
          </h2>
          <ul className="list-none p-0 m-0">
            <li className="py-3 border-b border-rule">
              <div className="font-mono text-kicker uppercase text-muted mb-1">
                // STATUS
              </div>
              <Link href="https://status.arp.run" variant="plain">
                <span className="font-display text-h5">status.arp.run</span>
              </Link>
              <p className="mt-1 text-body-sm text-ink-2">
                Live status of ARP Cloud services.
              </p>
            </li>
            <li className="py-3 border-b border-rule">
              <div className="font-mono text-kicker uppercase text-muted mb-1">
                // DOCS
              </div>
              <Link href="https://spec.arp.run" variant="plain">
                <span className="font-display text-h5">spec.arp.run</span>
              </Link>
              <p className="mt-1 text-body-sm text-ink-2">
                Protocol spec, scope catalog, and integration guides.
              </p>
            </li>
            <li className="py-3 border-b border-rule">
              <div className="font-mono text-kicker uppercase text-muted mb-1">
                // GITHUB ISSUES
              </div>
              <Link
                href="https://github.com/KybernesisAI/arp/issues"
                variant="plain"
              >
                <span className="font-display text-h5">
                  github.com/KybernesisAI/arp
                </span>
              </Link>
              <p className="mt-1 text-body-sm text-ink-2">
                File bugs or feature requests against the open-source protocol
                + reference implementation.
              </p>
            </li>
          </ul>
        </section>

        <section className="mt-12">
          <div className="font-mono text-kicker uppercase text-muted mb-2">
            // DATA + PRIVACY
          </div>
          <p className="text-body-sm text-ink-2">
            Before sharing screenshots or logs, review what's in them — audit
            entries can contain peer DIDs and message types. For anything you'd
            rather keep private, email us and we'll coordinate a secure channel
            (PGP, or Keybase) before you send. See{' '}
            <Link href="/legal/privacy">the privacy policy</Link> for how we
            handle the data you do send us. ARP Cloud tenant data remains
            tenant-isolated at rest (see the tenant-isolation model in{' '}
            <Code>/legal/dpa</Code>).
          </p>
        </section>
      </div>
    </AppShell>
  );
}
