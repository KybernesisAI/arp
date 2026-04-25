import type { ReactNode } from 'react';
import { Header } from './Header';

/**
 * Authenticated owner-app shell. Mirrors the cloud `AppShell` chrome
 * (Phase 8.75 Swiss/editorial): sticky brand nav with the agent banner,
 * a centred page container, and a slim footer cross-linking to the cloud
 * legal pages so we keep one source of truth for terms / privacy / DPA.
 *
 * Pages that need an unauthenticated chrome (e.g. `/login`) can pass
 * `chrome={false}` to skip the agent header — the page renders its own
 * minimal frame inside the same paper/ink ground.
 */
export function OwnerAppShell({
  children,
  chrome = true,
}: {
  children: ReactNode;
  chrome?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      {chrome && <Header />}
      <main className="flex-1 py-12 lg:py-16">
        <div className="mx-auto w-full max-w-page px-8">{children}</div>
      </main>
      <footer className="border-t border-rule bg-paper py-6 font-mono text-kicker uppercase text-muted">
        <div className="mx-auto max-w-page px-8">
          <div className="grid grid-cols-12 items-center gap-4">
            <div className="col-span-12 md:col-span-6">
              <b className="font-medium text-ink">ARP · OWNER-APP</b>
              {' · '}LOCAL RUNTIME
            </div>
            <div className="col-span-12 md:col-span-6 md:text-right">
              <a
                href="https://cloud.arp.run/legal/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted hover:text-ink"
              >
                TERMS
              </a>
              {' · '}
              <a
                href="https://cloud.arp.run/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted hover:text-ink"
              >
                PRIVACY
              </a>
              {' · '}
              <a
                href="https://cloud.arp.run/support"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted hover:text-ink"
              >
                SUPPORT
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
