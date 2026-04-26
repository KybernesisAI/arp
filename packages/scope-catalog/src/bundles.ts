/**
 * Named multi-scope bundles offered as one-tap presets in the consent UI.
 *
 * Source: ARP-scope-catalog-v1.md §6.
 *
 * `params` values marked `null` are user-picked (the UI prompts at
 * bundle-activation time). Values marked with a concrete number/string are
 * presets baked into the bundle.
 */
export interface BundleDefinition {
  id: string;
  version: string;
  label: string;
  description: string;
  /**
   * Ordered list of scopes. Each has an optional `params` object; values
   * that are `'<user-picks>'` (string) indicate user-supplied inputs at
   * activation time (the UI collects them).
   */
  scopes: Array<{
    id: string;
    params?: Record<string, unknown>;
  }>;
}

export const BUNDLES: readonly BundleDefinition[] = [
  {
    id: 'bundle.trusted_full_access.v1',
    version: '1.0.0',
    label: 'Internal trust · full access',
    description:
      'Peer can do anything — every action, every resource. Use ONLY for agents you fully control (same-principal, intra-company, internal automation). Bypasses all per-action policy gating.',
    scopes: [{ id: 'system.trusted.full_access' }],
  },
  {
    id: 'bundle.project_collaboration.v1',
    version: '1.0.0',
    label: 'Project collaboration',
    description:
      'Collaborate on a project — read files, task status, and notes; no writes or external sharing.',
    scopes: [
      { id: 'files.projects.list' },
      { id: 'files.project.metadata.read', params: { project_id: '<user-picks>' } },
      { id: 'files.project.files.read', params: { project_id: '<user-picks>', max_size_mb: 25 } },
      { id: 'files.project.files.summarize', params: { project_id: '<user-picks>', max_output_words: 2000 } },
      { id: 'tasks.list', params: { project_id: '<user-picks>' } },
      { id: 'tasks.read', params: { project_id: '<user-picks>' } },
      { id: 'tasks.status.update', params: { project_id: '<user-picks>' } },
      { id: 'notes.search', params: { collection_id: '<user-picks>' } },
      { id: 'notes.read', params: { collection_id: '<user-picks>' } },
    ],
  },
  {
    id: 'bundle.scheduling_assistant.v1',
    version: '1.0.0',
    label: 'Scheduling assistant',
    description: 'Coordinate meetings on your calendar.',
    scopes: [
      { id: 'calendar.availability.read', params: { days_ahead: 14 } },
      {
        id: 'calendar.events.propose',
        params: { max_attendees: 10, max_duration_min: 60 },
      },
      { id: 'contacts.search', params: { attribute_allowlist: ['name', 'email'] } },
      { id: 'messaging.relay.to_principal' },
    ],
  },
  {
    id: 'bundle.research_agent.v1',
    version: '1.0.0',
    label: 'Research agent',
    description: 'Pull research without writing.',
    scopes: [
      { id: 'files.projects.list' },
      { id: 'files.project.files.read', params: { project_id: '<user-picks>', max_size_mb: 25 } },
      { id: 'files.project.files.summarize', params: { project_id: '<user-picks>', max_output_words: 2000 } },
      { id: 'notes.search', params: { collection_id: '<user-picks>' } },
      { id: 'notes.read', params: { collection_id: '<user-picks>' } },
      { id: 'knowledge.query', params: { kb_id: '<user-picks>', max_tokens: 8000 } },
      { id: 'credentials.proof.zk.request', params: { attribute: 'verified_human' } },
    ],
  },
  {
    id: 'bundle.procurement_agent.v1',
    version: '1.0.0',
    label: 'Procurement agent',
    description: 'Buy things under tight caps.',
    scopes: [
      { id: 'payments.quote.request' },
      {
        id: 'payments.authorize.capped',
        params: { max_per_txn_usd: 25, max_per_30d_usd: 200 },
      },
      { id: 'payments.history.read', params: { days_back: 90 } },
      { id: 'messaging.relay.to_principal' },
    ],
  },
  {
    id: 'bundle.executive_assistant.v1',
    version: '1.0.0',
    label: 'Executive assistant',
    description: 'Broad assistant; step-up on anything external-facing.',
    scopes: [
      { id: 'calendar.availability.read', params: { days_ahead: 14 } },
      {
        id: 'calendar.events.propose',
        params: { max_attendees: 10, max_duration_min: 60 },
      },
      { id: 'calendar.events.modify' },
      { id: 'messaging.email.summary' },
      { id: 'messaging.email.draft.compose' },
      { id: 'messaging.email.send.reviewed', params: { recipient_allowlist: [] } },
      { id: 'contacts.search', params: { attribute_allowlist: ['name', 'email'] } },
      { id: 'tasks.list', params: { project_id: '<user-picks>' } },
      { id: 'tasks.read', params: { project_id: '<user-picks>' } },
      { id: 'tasks.create', params: { project_id: '<user-picks>', max_per_day: 50 } },
      { id: 'tasks.status.update', params: { project_id: '<user-picks>' } },
      { id: 'notes.search', params: { collection_id: '<user-picks>' } },
      { id: 'notes.read', params: { collection_id: '<user-picks>' } },
      { id: 'notes.write', params: { collection_id: '<user-picks>', max_per_day: 100 } },
      { id: 'work.status.read' },
      { id: 'work.reports.summary', params: { period: 'week' } },
    ],
  },
] as const;

export function findBundle(id: string): BundleDefinition | undefined {
  return BUNDLES.find((b) => b.id === id);
}
