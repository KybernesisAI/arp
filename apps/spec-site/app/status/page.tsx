import type { Metadata } from 'next';
import type * as React from 'react';

import { cn } from '@/lib/cn';

export const metadata: Metadata = {
  title: 'Status',
  description:
    'Current availability of ARP public surfaces — arp.run, cloud.arp.run, spec.arp.run, docs.arp.run.',
  openGraph: {
    title: 'Status — ARP',
    description: 'Current availability of ARP public surfaces.',
    url: 'https://status.arp.run',
    type: 'website',
  },
};

// Revalidate daily — the page is static placeholder data for slice 9e.
// When live checks land post-launch, swap to on-demand revalidation.
export const revalidate = 86_400;

type ServiceStatus = 'operational' | 'degraded' | 'down';

type Service = {
  id: string;
  name: string;
  subtitle: string;
  status: ServiceStatus;
  lastCheckedAt: string;
};

type ServiceGroup = {
  id: string;
  kicker: string;
  title: string;
  services: Service[];
};

type Incident = {
  id: string;
  title: string;
  severity: 'sev1' | 'sev2' | 'sev3' | 'sev4';
  startedAt: string;
  resolvedAt: string | null;
  summary: string;
};

const CHECKED_AT = '2026-04-24T00:00:00Z';

const SERVICE_GROUPS: ServiceGroup[] = [
  {
    id: 'project',
    kicker: '// PROJECT',
    title: 'arp.run — open protocol surfaces',
    services: [
      {
        id: 'arp-run',
        name: 'arp.run',
        subtitle: 'Public landing + project pages',
        status: 'operational',
        lastCheckedAt: CHECKED_AT,
      },
    ],
  },
  {
    id: 'cloud',
    kicker: '// CLOUD',
    title: 'cloud.arp.run — hosted runtime + app',
    services: [
      {
        id: 'cloud-marketing',
        name: 'cloud.arp.run',
        subtitle: 'Cloud marketing site + signup',
        status: 'operational',
        lastCheckedAt: CHECKED_AT,
      },
      {
        id: 'cloud-app',
        name: 'app.arp.run',
        subtitle: 'Authenticated dashboard',
        status: 'operational',
        lastCheckedAt: CHECKED_AT,
      },
      {
        id: 'cloud-api',
        name: 'cloud.arp.run/api',
        subtitle: 'Registrar + push + webauthn endpoints',
        status: 'operational',
        lastCheckedAt: CHECKED_AT,
      },
    ],
  },
  {
    id: 'docs',
    kicker: '// DOCS',
    title: 'spec.arp.run + docs.arp.run — specification + developer docs',
    services: [
      {
        id: 'spec-site',
        name: 'spec.arp.run',
        subtitle: 'Specification + scope catalog viewer + schema browser',
        status: 'operational',
        lastCheckedAt: CHECKED_AT,
      },
      {
        id: 'docs-site',
        name: 'docs.arp.run',
        subtitle: 'Developer documentation',
        status: 'operational',
        lastCheckedAt: CHECKED_AT,
      },
    ],
  },
];

const RECENT_INCIDENTS: Incident[] = [];

export default function StatusPage(): React.JSX.Element {
  const overall = overallStatus(SERVICE_GROUPS);

  return (
    <>
      <section className="border-t border-rule">
        <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 py-20">
          <div className="col-span-12 flex items-center gap-3">
            <StatusDot status={overall} pulse />
            <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
              STATUS · {statusLabel(overall)}
            </span>
          </div>
          <h1 className="col-span-12 mt-8 font-display text-display-lg leading-[1.02] tracking-[-0.02em] text-ink md:col-span-10">
            {overall === 'operational'
              ? 'All ARP surfaces operational.'
              : overall === 'degraded'
                ? 'Some ARP surfaces are degraded.'
                : 'An ARP surface is down.'}
          </h1>
          <p className="col-span-12 mt-6 max-w-2xl font-sans text-body-lg text-ink-2 md:col-span-8">
            Live availability of the public ARP surfaces. Last checked{' '}
            <time dateTime={CHECKED_AT}>{formatChecked(CHECKED_AT)}</time>.
          </p>
        </div>
      </section>

      {SERVICE_GROUPS.map((group, i) => (
        <section
          key={group.id}
          className={cn(
            'border-t border-rule',
            i % 2 === 1 ? 'bg-paper-2' : '',
          )}
        >
          <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 py-16">
            <div className="col-span-12 grid grid-cols-12 gap-4 border-b border-rule pb-6">
              <span className="col-span-1 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="col-span-11 font-mono text-kicker uppercase tracking-[0.14em] text-muted md:col-span-5">
                {group.kicker}
              </span>
              <h2 className="col-span-12 mt-4 font-display text-h2 text-ink md:col-span-7">
                {group.title}
              </h2>
            </div>

            <ul className="col-span-12 mt-4 list-none border-t border-rule p-0">
              {group.services.map((service) => (
                <li
                  key={service.id}
                  className="grid grid-cols-12 items-baseline gap-4 border-b border-rule py-5"
                >
                  <div className="col-span-12 flex items-center gap-3 md:col-span-4">
                    <StatusDot status={service.status} />
                    <span className="font-display text-h5 text-ink">
                      {service.name}
                    </span>
                  </div>
                  <div className="col-span-12 font-sans text-body-sm text-ink-2 md:col-span-5">
                    {service.subtitle}
                  </div>
                  <div className="col-span-12 font-mono text-kicker uppercase tracking-[0.14em] text-muted md:col-span-3 md:text-right">
                    {statusLabel(service.status)} ·{' '}
                    <time dateTime={service.lastCheckedAt}>
                      {formatCheckedShort(service.lastCheckedAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="border-t border-rule">
        <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 py-16">
          <div className="col-span-12 grid grid-cols-12 gap-4 border-b border-rule pb-6">
            <span className="col-span-1 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
              {String(SERVICE_GROUPS.length + 1).padStart(2, '0')}
            </span>
            <span className="col-span-11 font-mono text-kicker uppercase tracking-[0.14em] text-muted md:col-span-5">
              // RECENT INCIDENTS
            </span>
            <h2 className="col-span-12 mt-4 font-display text-h2 text-ink md:col-span-7">
              Last 90 days
            </h2>
          </div>

          {RECENT_INCIDENTS.length === 0 ? (
            <p className="col-span-12 mt-8 font-sans text-body-lg text-ink-2 md:col-span-8">
              No incidents reported.
            </p>
          ) : (
            <ul className="col-span-12 mt-4 list-none border-t border-rule p-0">
              {RECENT_INCIDENTS.map((incident) => (
                <li
                  key={incident.id}
                  className="grid grid-cols-12 items-baseline gap-4 border-b border-rule py-5"
                >
                  <div className="col-span-12 font-mono text-kicker uppercase tracking-[0.14em] text-muted md:col-span-2">
                    {incident.severity.toUpperCase()}
                  </div>
                  <div className="col-span-12 md:col-span-7">
                    <div className="font-display text-h5 text-ink">
                      {incident.title}
                    </div>
                    <p className="mt-2 font-sans text-body-sm text-ink-2">
                      {incident.summary}
                    </p>
                  </div>
                  <div className="col-span-12 font-mono text-kicker uppercase tracking-[0.14em] text-muted md:col-span-3 md:text-right">
                    <time dateTime={incident.startedAt}>
                      {formatCheckedShort(incident.startedAt)}
                    </time>
                    {incident.resolvedAt ? ' · RESOLVED' : ' · ONGOING'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

function StatusDot({
  status,
  pulse = false,
}: {
  status: ServiceStatus;
  pulse?: boolean;
}): React.JSX.Element {
  const tone =
    status === 'operational'
      ? 'bg-signal-green'
      : status === 'degraded'
        ? 'bg-signal-yellow'
        : 'bg-signal-red';
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-2 w-2 rounded-full', tone, pulse && 'animate-pulse')}
    />
  );
}

function statusLabel(status: ServiceStatus): string {
  switch (status) {
    case 'operational':
      return 'OPERATIONAL';
    case 'degraded':
      return 'DEGRADED';
    case 'down':
      return 'DOWN';
  }
}

function overallStatus(groups: ServiceGroup[]): ServiceStatus {
  let worst: ServiceStatus = 'operational';
  for (const group of groups) {
    for (const service of group.services) {
      if (service.status === 'down') return 'down';
      if (service.status === 'degraded') worst = 'degraded';
    }
  }
  return worst;
}

function formatChecked(iso: string): string {
  const d = new Date(iso);
  return d.toUTCString();
}

function formatCheckedShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
