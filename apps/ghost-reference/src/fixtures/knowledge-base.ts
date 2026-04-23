/**
 * Ghost fixture knowledge base. Schema identical to samantha-reference
 * so tests swap between them without translation.
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

export const DEFAULT_FIXTURE: KbTable = {
  'conn_ghost_fixture_default': {
    gamma: {
      'README.md': 'Project Gamma (Ghost side): demo data only.',
    },
  },
};
