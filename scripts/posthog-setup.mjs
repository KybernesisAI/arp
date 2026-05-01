#!/usr/bin/env node
/**
 * Bootstrap ARP's PostHog project with the canonical dashboards.
 *
 * Reads POSTHOG_PERSONAL_API_KEY + POSTHOG_HOST + POSTHOG_PROJECT_ID
 * from env. Creates (or finds + updates) five dashboards:
 *
 *   1. North Star            — DAU/WAU/MAU, signups, agents, MRR
 *   2. Activation Funnel     — visit → signup → first message
 *   3. Connection Health     — pairs, scopes, deny reasons
 *   4. Billing & Growth      — Pro conversion, MRR, churn
 *   5. Product Engagement    — CTAs, lander → signup, dashboard time
 *
 * Idempotent: re-runnable. Insights with the same name on a dashboard
 * are updated in place.
 */

const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const HOST = process.env.POSTHOG_HOST ?? 'https://us.posthog.com';
const PROJECT = process.env.POSTHOG_PROJECT_ID ?? '404547';

if (!KEY) {
  console.error('POSTHOG_PERSONAL_API_KEY not set');
  process.exit(1);
}

async function ph(method, path, body) {
  const res = await fetch(`${HOST}/api/projects/${PROJECT}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path}: ${res.status}\n${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function findOrCreateDashboard(name, description) {
  const list = await ph('GET', `/dashboards/?search=${encodeURIComponent(name)}`);
  const found = list.results?.find((d) => d.name === name);
  if (found) {
    console.log(`✓ dashboard exists: ${name} (id=${found.id})`);
    return found;
  }
  const created = await ph('POST', '/dashboards/', { name, description });
  console.log(`+ created dashboard: ${name} (id=${created.id})`);
  return created;
}

async function findInsightOnDashboard(dashboardId, name) {
  // Server 500s on combined dashboards=+search= filters; list per-dashboard
  // via /dashboards/<id>/ which returns its tiles and dig out the insight.
  const dash = await ph('GET', `/dashboards/${dashboardId}/`);
  const tiles = dash.tiles ?? [];
  for (const t of tiles) {
    if (t.insight && t.insight.name === name) return t.insight;
  }
  return null;
}

async function upsertInsight(dashboardId, insight) {
  const existing = await findInsightOnDashboard(dashboardId, insight.name);
  if (existing) {
    const updated = await ph('PATCH', `/insights/${existing.id}/`, insight);
    console.log(`  ~ ${insight.name}`);
    return updated;
  }
  const created = await ph('POST', '/insights/', {
    ...insight,
    dashboards: [dashboardId],
  });
  console.log(`  + ${insight.name}`);
  return created;
}

// ─── Insight builders ────────────────────────────────────────────────

const trends = (name, series, opts = {}) => ({
  name,
  description: opts.description ?? '',
  query: {
    kind: 'InsightVizNode',
    source: {
      kind: 'TrendsQuery',
      series,
      trendsFilter: {
        display: opts.display ?? 'ActionsLineGraph',
        ...(opts.aggregation ? { aggregation_axis_format: opts.aggregation } : {}),
      },
      interval: opts.interval ?? 'day',
      dateRange: { date_from: opts.dateFrom ?? '-30d' },
    },
  },
});

const event = (id, props = {}) => ({
  kind: 'EventsNode',
  event: id,
  name: id,
  math: props.math ?? 'total',
  ...(props.aggregation ? { math: props.aggregation } : {}),
});

const dauEvent = (id) => event(id, { math: 'dau' });

const funnel = (name, steps, opts = {}) => ({
  name,
  description: opts.description ?? '',
  query: {
    kind: 'InsightVizNode',
    source: {
      kind: 'FunnelsQuery',
      series: steps.map((s) => ({
        kind: 'EventsNode',
        event: s.event,
        name: s.name ?? s.event,
      })),
      funnelsFilter: {
        funnelVizType: 'steps',
        funnelOrderType: 'ordered',
      },
      dateRange: { date_from: opts.dateFrom ?? '-30d' },
    },
  },
});

const stickiness = (name, eventId, opts = {}) => ({
  name,
  description: opts.description ?? '',
  query: {
    kind: 'InsightVizNode',
    source: {
      kind: 'LifecycleQuery',
      series: [{ kind: 'EventsNode', event: eventId, name: eventId }],
      dateRange: { date_from: opts.dateFrom ?? '-30d' },
    },
  },
});

// ─── Dashboards + insights ───────────────────────────────────────────

const setup = [
  {
    name: '01 — North Star',
    description: 'High-level health: who is using ARP and how much.',
    insights: [
      trends('Daily active users', [dauEvent('$pageview')], { display: 'BoldNumber' }),
      trends('Pageviews per day', [event('$pageview')], { dateFrom: '-30d' }),
      trends('New signups per day', [event('tenant_signed_up')], { dateFrom: '-30d' }),
      trends('Agents provisioned per day', [event('agent_provisioned')], { dateFrom: '-30d' }),
      trends('Pairings created per day', [event('pairing_invitation_created')], { dateFrom: '-30d' }),
      trends('Pairings accepted per day', [event('pairing_accepted')], { dateFrom: '-30d' }),
      trends(
        'Connections revoked per day',
        [event('connection_revoked')],
        { dateFrom: '-30d' },
      ),
      trends(
        'Billing checkouts started',
        [event('billing_checkout_started')],
        { dateFrom: '-30d' },
      ),
    ],
  },
  {
    name: '02 — Activation Funnel',
    description:
      'From first visit through first paired connection. Drop-off at each step shows where users get stuck.',
    insights: [
      funnel(
        'Visit → Signup → First Agent → First Pair',
        [
          { event: '$pageview', name: 'Landed on site' },
          { event: 'tenant_signed_up', name: 'Account created' },
          { event: 'agent_provisioned', name: 'Agent provisioned' },
          { event: 'pairing_invitation_created', name: 'Sent first invite' },
          { event: 'pairing_accepted', name: 'First pair accepted' },
        ],
        { dateFrom: '-30d' },
      ),
      trends('Time to first agent (signups → provisioned)', [
        event('tenant_signed_up'),
        event('agent_provisioned'),
      ]),
      trends('Time to first pair (provisioned → invite created)', [
        event('agent_provisioned'),
        event('pairing_invitation_created'),
      ]),
    ],
  },
  {
    name: '03 — Connection Health',
    description:
      'Once connections exist, what happens? Active, scope mix, deny reasons, lifecycle events.',
    insights: [
      trends('Pairings invited (cumulative)', [event('pairing_invitation_created')], {
        dateFrom: '-90d',
        display: 'ActionsLineGraphCumulative',
      }),
      trends('Pairings accepted (cumulative)', [event('pairing_accepted')], {
        dateFrom: '-90d',
        display: 'ActionsLineGraphCumulative',
      }),
      trends('Connections revoked', [event('connection_revoked')], { dateFrom: '-90d' }),
      trends('Connections suspended', [event('connection_suspended')], { dateFrom: '-90d' }),
    ],
  },
  {
    name: '04 — Billing & Growth',
    description:
      'Free → Pro funnel, MRR (post-Stripe-import), churn. Stripe data-warehouse connector adds subscription events.',
    insights: [
      trends('Billing checkouts started per day', [event('billing_checkout_started')], {
        dateFrom: '-90d',
      }),
      trends('Signups per week', [event('tenant_signed_up')], {
        dateFrom: '-90d',
        interval: 'week',
      }),
      trends('Agents per tenant (provisioned, cumulative)', [event('agent_provisioned')], {
        dateFrom: '-90d',
        display: 'ActionsLineGraphCumulative',
      }),
    ],
  },
  {
    name: '05 — Product Engagement',
    description:
      'How users interact with the dashboard, lander, and pricing surfaces. Autocapture-driven.',
    insights: [
      trends('Pageviews by URL', [event('$pageview')], { dateFrom: '-30d' }),
      trends('Most-clicked elements (autocapture)', [event('$autocapture')], {
        dateFrom: '-30d',
      }),
      stickiness('User lifecycle (active / new / dormant / resurrecting)', '$pageview', {
        dateFrom: '-30d',
      }),
      trends('Web vitals samples per day', [event('$web_vitals')], { dateFrom: '-30d' }),
    ],
  },
];

(async () => {
  for (const d of setup) {
    const dashboard = await findOrCreateDashboard(d.name, d.description);
    for (const insight of d.insights) {
      try {
        await upsertInsight(dashboard.id, insight);
      } catch (err) {
        console.error(`  ! failed: ${insight.name}\n     ${err.message.split('\n')[0]}`);
      }
    }
  }
  console.log('\nDone.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
