/**
 * Core scaffolder. Reads a template directory, renders each file through
 * Handlebars, and writes to the target path.
 *
 * Templates live under `packages/create-adapter/templates/<lang>/` and the
 * scaffolder resolves them relative to the compiled `dist/` via
 * `fileURLToPath(import.meta.url)`. Consumers using the programmatic API
 * in a non-standard layout can pass `templatesDir` directly.
 */

import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';

export type SupportedLanguage = 'ts' | 'python';

export interface ScaffoldOptions {
  /** Framework slug (kebab-case). Used in file paths + imports. */
  framework: string;
  /** Human-readable name (e.g. "KyberBot"). Used in README, error strings. */
  displayName?: string;
  /** Target language. */
  language: SupportedLanguage;
  /** Destination directory — will be created if missing. */
  out: string;
  /** Override the template root. Default: bundled templates. */
  templatesDir?: string;
  /** ARP spec version pinned in the generated package.json. */
  arpVersion?: string;
  /** When true, overwrite existing files. Default false. */
  force?: boolean;
}

export interface ScaffoldResult {
  createdFiles: string[];
  skippedFiles: string[];
  summary: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_TEMPLATES_DIR = resolve(__dirname, '..', 'templates');

export async function scaffoldAdapter(
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const framework = options.framework.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(framework)) {
    throw new Error(
      `framework slug "${options.framework}" must match /^[a-z][a-z0-9-]*$/`,
    );
  }
  const displayName = options.displayName ?? toDisplayName(framework);
  const arpVersion = options.arpVersion ?? '^0.1.0';

  const templateRoot = options.templatesDir
    ? resolve(options.templatesDir, options.language)
    : join(DEFAULT_TEMPLATES_DIR, options.language);
  if (!existsSync(templateRoot)) {
    throw new Error(`template directory missing: ${templateRoot}`);
  }

  const context = {
    framework,
    frameworkPascal: toPascal(framework),
    frameworkCamel: toCamel(framework),
    frameworkSnake: framework.replace(/-/g, '_'),
    frameworkUpper: framework.toUpperCase().replace(/-/g, '_'),
    displayName,
    arpVersion,
    /** Best-effort Python-compatible version range — strip leading `^`. */
    pythonArpVersion: arpVersion.startsWith('^')
      ? `>=${arpVersion.slice(1)}`
      : arpVersion,
    generatedAt: new Date().toISOString(),
  };

  const created: string[] = [];
  const skipped: string[] = [];

  for (const rel of walk(templateRoot)) {
    const src = join(templateRoot, rel);
    const dst = join(options.out, renderFilename(rel, context));
    if (existsSync(dst) && !options.force) {
      skipped.push(dst);
      continue;
    }
    const raw = readFileSync(src, 'utf8');
    const rendered = rel.endsWith('.hbs')
      ? Handlebars.compile(raw, { noEscape: true })(context)
      : raw;
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, rendered);
    created.push(dst);
  }

  const summary = [
    `Scaffolded @kybernesis/arp-adapter-${framework} (${options.language}) at ${options.out}.`,
    `Created ${created.length} file(s), skipped ${skipped.length}.`,
    '',
    'Next steps:',
    `  1. cd ${relative(process.cwd(), options.out) || options.out}`,
    options.language === 'ts'
      ? '  2. pnpm install'
      : '  2. uv sync  # or: python -m pip install -e .',
    '  3. Implement src/* to map your framework\'s public extension points to ArpAgent.',
    '  4. Run the conformance test: pnpm test  (or: uv run pytest)',
    '  5. See docs/ARP-adapter-authoring-guide.md for the full contract.',
  ].join('\n');

  return { createdFiles: created, skippedFiles: skipped, summary };
}

function walk(dir: string): string[] {
  const out: string[] = [];
  function recurse(sub: string) {
    const abs = join(dir, sub);
    for (const entry of readdirSync(abs)) {
      const fullRel = sub ? join(sub, entry) : entry;
      const fullAbs = join(dir, fullRel);
      const st = statSync(fullAbs);
      if (st.isDirectory()) recurse(fullRel);
      else out.push(fullRel);
    }
  }
  recurse('');
  return out;
}

function renderFilename(rel: string, ctx: Record<string, string>): string {
  // Trim trailing `.hbs` and run Handlebars on the path (for filenames
  // like `src/{{framework}}.ts.hbs`).
  const withoutHbs = rel.endsWith('.hbs') ? rel.slice(0, -'.hbs'.length) : rel;
  return Handlebars.compile(withoutHbs, { noEscape: true })(ctx);
}

function toPascal(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function toCamel(slug: string): string {
  const pascal = toPascal(slug);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toDisplayName(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}
