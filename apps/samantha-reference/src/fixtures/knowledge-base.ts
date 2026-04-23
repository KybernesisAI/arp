/**
 * Fixture knowledge base — per-connection rows to demonstrate the memory
 * isolation story in demos. Intentionally tiny and fake. No real data.
 *
 * Rows live at `<connection_id>:<project_id>:<file>`. Lookups that miss
 * return `null`; the dispatcher surfaces a `[fixture missing]` note. A
 * connection's own bucket is also available via the runtime's
 * ConnectionMemory for write-heavy flows (remember / recall tools).
 */

export interface KnowledgeBase {
  readProjectFile(connectionId: string, projectId: string, file: string): string | null;
  listProjects(connectionId: string): string[];
}

type KbTable = Record<string, Record<string, Record<string, string>>>;

export function createFixtureKb(table: KbTable): KnowledgeBase {
  return {
    readProjectFile(connectionId, projectId, file) {
      return table[connectionId]?.[projectId]?.[file] ?? null;
    },
    listProjects(connectionId) {
      return Object.keys(table[connectionId] ?? {});
    },
  };
}

/**
 * Tiny default fixture. Only used if the reference-agent binary boots with
 * no `--kb` override. Useful for quick smoke tests; production-like demos
 * wire their own fixture instead.
 */
export const DEFAULT_FIXTURE: KbTable = {
  // Fixtures intentionally scoped by CONNECTION ID (not peer DID) to mirror
  // the Layer-5 isolation contract. The phase-5 acceptance tests override
  // this with connection IDs minted at test time.
  'conn_samantha_fixture_default': {
    alpha: {
      'README.md': 'Project Alpha: internal prototype. Status: green.',
      'spec.md': 'Design spec stub. No PII.',
    },
  },
};
