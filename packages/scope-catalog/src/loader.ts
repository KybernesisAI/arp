import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ScopeTemplateSchema, type ScopeTemplate } from '@kybernesis/arp-spec';

export class ScopeLoadError extends Error {
  public readonly file?: string;
  public readonly issues?: unknown;

  constructor(message: string, opts?: { file?: string; issues?: unknown }) {
    super(message);
    this.name = 'ScopeLoadError';
    if (opts?.file !== undefined) this.file = opts.file;
    if (opts?.issues !== undefined) this.issues = opts.issues;
  }
}

/**
 * Load a single YAML scope file, validate it against `ScopeTemplateSchema`,
 * and return the parsed value. Throws `ScopeLoadError` on YAML parse errors
 * or schema validation failures.
 */
export function loadScopeFile(filePath: string): ScopeTemplate {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (e) {
    throw new ScopeLoadError(`cannot read ${filePath}: ${(e as Error).message}`, {
      file: filePath,
    });
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    throw new ScopeLoadError(`invalid YAML in ${filePath}: ${(e as Error).message}`, {
      file: filePath,
    });
  }

  const result = ScopeTemplateSchema.safeParse(parsed);
  if (!result.success) {
    throw new ScopeLoadError(`scope ${filePath} failed schema validation`, {
      file: filePath,
      issues: result.error.issues,
    });
  }
  return result.data;
}

/**
 * Load every `*.yaml` file under `scopesDir`, validate each, and return the
 * sorted-by-id array. Also verifies that every filename matches the scope's
 * `id` field (`<id>.yaml`) — cheap but valuable invariant.
 */
export function loadScopesFromDirectory(scopesDir: string): ScopeTemplate[] {
  const st = statSync(scopesDir);
  if (!st.isDirectory()) {
    throw new ScopeLoadError(`${scopesDir} is not a directory`);
  }

  const files = readdirSync(scopesDir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();

  const seen = new Set<string>();
  const scopes: ScopeTemplate[] = [];

  for (const file of files) {
    const full = resolve(scopesDir, file);
    const scope = loadScopeFile(full);
    const expected = `${scope.id}.yaml`;
    if (file !== expected && !(file === `${scope.id}.yml`)) {
      throw new ScopeLoadError(
        `filename ${file} does not match scope id ${scope.id} (expected ${expected})`,
        { file: full }
      );
    }
    if (seen.has(scope.id)) {
      throw new ScopeLoadError(`duplicate scope id ${scope.id}`, { file: full });
    }
    seen.add(scope.id);
    scopes.push(scope);
  }

  scopes.sort((a, b) => a.id.localeCompare(b.id));
  return scopes;
}
