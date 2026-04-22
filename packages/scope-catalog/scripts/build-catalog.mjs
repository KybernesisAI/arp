#!/usr/bin/env node
/**
 * Build step: load the 50 YAML scopes, validate each, generate the public
 * manifest + the compact scopes.json, and write both under `generated/`.
 *
 * `updated_at` is pinned to a deterministic value derived from git so the
 * manifest checksum is stable across CI runs.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { loadScopesFromDirectory, buildCatalogManifest } from '../dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..');
const SCOPES_DIR = resolve(PACKAGE_ROOT, 'scopes');
const OUT_DIR = resolve(PACKAGE_ROOT, 'generated');

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

// Derive a stable `updated_at` from the HEAD commit date, falling back to
// a fixed epoch string when git is unavailable (CI-ephemeral container
// without git history, etc).
let updatedAt;
try {
  const iso = execSync('git log -1 --format=%cI -- scopes', {
    cwd: PACKAGE_ROOT,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
  updatedAt = iso || '2026-04-22T00:00:00Z';
} catch {
  updatedAt = '2026-04-22T00:00:00Z';
}

const scopes = loadScopesFromDirectory(SCOPES_DIR);
const manifest = buildCatalogManifest(scopes, { version: 'v1', updatedAt });

writeFileSync(
  resolve(OUT_DIR, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);

writeFileSync(
  resolve(OUT_DIR, 'scopes.json'),
  `${JSON.stringify(scopes, null, 2)}\n`,
  'utf8'
);

console.log(
  `built catalog: ${scopes.length} scopes, checksum=${manifest.checksum}, updated_at=${updatedAt}`
);
