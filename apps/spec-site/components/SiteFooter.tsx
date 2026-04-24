import Link from 'next/link';
import type * as React from 'react';

export function SiteFooter(): React.JSX.Element {
  return (
    <footer className="border-t border-rule bg-paper">
      <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 py-16">
        <div className="col-span-12 md:col-span-4">
          <div className="flex items-center gap-3">
            <span className="inline-block h-3 w-3 bg-ink" />
            <span className="font-mono text-kicker uppercase tracking-[0.14em] text-ink">
              ARP / AGENT RELATIONSHIP PROTOCOL
            </span>
          </div>
          <p className="mt-6 max-w-sm font-sans text-body-sm text-ink-2">
            The communication and permissions layer for agent-to-agent interaction.
            Open source. MIT licensed.
          </p>
        </div>

        <div className="col-span-6 md:col-span-2">
          <h3 className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            SPEC
          </h3>
          <ul className="mt-4 space-y-2 font-sans text-body-sm">
            <li>
              <Link href="/spec/v0.1/overview" className="text-ink hover:opacity-60">
                Overview
              </Link>
            </li>
            <li>
              <Link
                href="/spec/v0.1/architecture"
                className="text-ink hover:opacity-60"
              >
                Architecture
              </Link>
            </li>
            <li>
              <Link
                href="/spec/v0.1/registrar-integration"
                className="text-ink hover:opacity-60"
              >
                Registrar integration
              </Link>
            </li>
          </ul>
        </div>

        <div className="col-span-6 md:col-span-2">
          <h3 className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            DOCS
          </h3>
          <ul className="mt-4 space-y-2 font-sans text-body-sm">
            <li>
              <Link
                href="/docs/getting-started"
                className="text-ink hover:opacity-60"
              >
                Getting started
              </Link>
            </li>
            <li>
              <Link href="/docs/install" className="text-ink hover:opacity-60">
                Install
              </Link>
            </li>
            <li>
              <Link href="/docs/sdks" className="text-ink hover:opacity-60">
                SDKs
              </Link>
            </li>
          </ul>
        </div>

        <div className="col-span-6 md:col-span-2">
          <h3 className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            COMMUNITY
          </h3>
          <ul className="mt-4 space-y-2 font-sans text-body-sm">
            <li>
              <Link
                href="https://github.com/KybernesisAI/arp"
                className="text-ink hover:opacity-60"
              >
                GitHub
              </Link>
            </li>
            <li>
              <Link
                href="https://github.com/KybernesisAI/arp/discussions"
                className="text-ink hover:opacity-60"
              >
                Discussions
              </Link>
            </li>
            <li>
              <Link href="/rfcs" className="text-ink hover:opacity-60">
                RFC process
              </Link>
            </li>
          </ul>
        </div>

        <div className="col-span-6 md:col-span-2">
          <h3 className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            CROSS-SITE
          </h3>
          <ul className="mt-4 space-y-2 font-sans text-body-sm">
            <li>
              <Link href="https://arp.run" className="text-ink hover:opacity-60">
                Project
              </Link>
            </li>
            <li>
              <Link
                href="https://cloud.arp.run"
                className="text-ink hover:opacity-60"
              >
                Cloud
              </Link>
            </li>
            <li>
              <Link
                href="https://cloud.arp.run/support"
                className="text-ink hover:opacity-60"
              >
                Support
              </Link>
            </li>
            <li>
              <Link
                href="https://status.arp.run"
                className="text-ink hover:opacity-60"
              >
                Status
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-rule">
        <div className="mx-auto flex w-full max-w-page items-center justify-between px-8 py-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          <span>© 2026 KYBERNESIS — MIT</span>
          <div className="flex gap-5">
            <Link
              href="https://cloud.arp.run/legal/terms"
              className="text-muted hover:text-ink"
            >
              TERMS
            </Link>
            <Link
              href="https://cloud.arp.run/legal/privacy"
              className="text-muted hover:text-ink"
            >
              PRIVACY
            </Link>
            <Link
              href="https://cloud.arp.run/legal/dpa"
              className="text-muted hover:text-ink"
            >
              DPA
            </Link>
            <Link
              href="https://cloud.arp.run/support"
              className="text-muted hover:text-ink"
            >
              SUPPORT
            </Link>
            <span>SPEC v0.1 · SITE REV 9e</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
