import Link from 'next/link';
import { env } from '@/lib/env';
import { formatAgentName } from '@/lib/format';
import { LogoutButton } from './LogoutButton';

/**
 * Sticky brand nav for authenticated owner-app pages. Visual treatment
 * mirrors the cloud `Nav` primitive (Phase 8.75 Swiss/editorial: paper
 * ground, mono tracked-uppercase links, hover underline). Pages that want
 * the full chrome — nav + agent banner + footer — should wrap in
 * `<OwnerAppShell>` instead of using this component directly.
 */
export function Header() {
  const e = env();
  return (
    <>
      <nav
        aria-label="Primary"
        className="sticky top-0 z-40 border-b border-rule bg-paper"
      >
        <div className="mx-auto grid max-w-page grid-cols-12 items-center gap-4 px-8 py-3.5">
          <Link
            href="/"
            className="col-span-6 flex items-baseline gap-2.5 md:col-span-4"
          >
            <BrandMark />
            <span className="font-display text-[14px] font-semibold tracking-[0.04em]">
              ARP
            </span>
            <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted sm:inline">
              // owner-app
            </span>
          </Link>
          <div className="col-span-6 flex flex-wrap items-center justify-end gap-3.5 font-mono text-[11px] uppercase tracking-[0.1em] md:col-span-8">
            <NavLink href="/">Connections</NavLink>
            <NavLink href="/pair">Pair</NavLink>
            <NavLink href="/settings">Settings</NavLink>
            <LogoutButton />
          </div>
        </div>
      </nav>
      <div className="border-b border-rule bg-paper">
        <div className="mx-auto max-w-page px-8 py-4">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
            {e.ARP_PRINCIPAL_DID}
          </div>
          <div className="font-display text-h4 font-medium text-ink">
            {formatAgentName(e.ARP_AGENT_DID)}
          </div>
        </div>
      </div>
    </>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="border-b border-transparent py-1.5 transition-colors duration-fast hover:border-ink"
    >
      {children}
    </Link>
  );
}

function BrandMark() {
  const size = 18;
  return (
    <span
      aria-hidden="true"
      className="relative inline-block translate-y-[3px] bg-signal-blue"
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-1 bg-paper" />
    </span>
  );
}
