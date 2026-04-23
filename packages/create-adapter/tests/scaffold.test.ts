import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { scaffoldAdapter } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function fresh(): string {
  const d = mkdtempSync(join(tmpdir(), 'arp-create-adapter-'));
  dirs.push(d);
  return d;
}

// Templates live at ../templates relative to the test file.
const TEMPLATES_DIR = resolve(__dirname, '..', 'templates');

describe('scaffoldAdapter', () => {
  it('scaffolds a TS adapter with renamed files', async () => {
    const out = fresh();
    const result = await scaffoldAdapter({
      framework: 'myframework',
      displayName: 'MyFramework',
      language: 'ts',
      out,
      templatesDir: TEMPLATES_DIR,
    });
    expect(result.createdFiles.length).toBeGreaterThan(0);

    const pkg = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8')) as {
      name: string;
    };
    expect(pkg.name).toBe('@kybernesis/arp-adapter-myframework');

    const indexSrc = readFileSync(join(out, 'src/index.ts'), 'utf8');
    expect(indexSrc).toContain('@kybernesis/arp-adapter-myframework');
    expect(indexSrc).toContain('MyframeworkLike');
    expect(existsSync(join(out, 'tests/conformance.test.ts'))).toBe(true);
    expect(existsSync(join(out, 'README.md'))).toBe(true);
    expect(existsSync(join(out, 'MIGRATION.md'))).toBe(true);
    // No trailing .hbs files.
    expect(result.createdFiles.some((f) => f.endsWith('.hbs'))).toBe(false);
  });

  it('scaffolds a Python adapter with module path substitution', async () => {
    const out = fresh();
    const result = await scaffoldAdapter({
      framework: 'myframework',
      displayName: 'MyFramework',
      language: 'python',
      out,
      templatesDir: TEMPLATES_DIR,
    });
    expect(result.createdFiles.length).toBeGreaterThan(0);
    const toml = readFileSync(join(out, 'pyproject.toml'), 'utf8');
    expect(toml).toContain('name = "arp-adapter-myframework"');
    expect(toml).toContain('packages = ["arp_adapter_myframework"]');

    expect(
      existsSync(join(out, 'arp_adapter_myframework/__init__.py')),
    ).toBe(true);
    expect(existsSync(join(out, 'tests/test_conformance.py'))).toBe(true);
  });

  it('rejects invalid framework slugs', async () => {
    await expect(
      scaffoldAdapter({
        framework: 'Bad Slug!',
        language: 'ts',
        out: fresh(),
        templatesDir: TEMPLATES_DIR,
      }),
    ).rejects.toThrow(/framework slug/);
  });

  it('skips existing files without --force', async () => {
    const out = fresh();
    await scaffoldAdapter({
      framework: 'twice',
      language: 'ts',
      out,
      templatesDir: TEMPLATES_DIR,
    });
    const second = await scaffoldAdapter({
      framework: 'twice',
      language: 'ts',
      out,
      templatesDir: TEMPLATES_DIR,
    });
    expect(second.skippedFiles.length).toBeGreaterThan(0);
    expect(second.createdFiles.length).toBe(0);
  });
});
