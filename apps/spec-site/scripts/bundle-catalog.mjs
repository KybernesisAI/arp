#!/usr/bin/env node
/**
 * Pre-build step: read the compiled scope catalog + its raw YAML sources
 * from `@kybernesis/arp-scope-catalog` and bundle them into a single
 * `.generated/catalog.json` artefact the spec-site imports directly.
 *
 * Keeping the read side build-time (rather than async at request time)
 * sidesteps Turbopack's aggressive `require.resolve` analysis and gives
 * us true static prerender on /scope-catalog and the /schema routes.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(APP_DIR, '..', '..');
const CATALOG_DIR = resolve(REPO_ROOT, 'packages', 'scope-catalog');

const scopesPath = resolve(CATALOG_DIR, 'generated', 'scopes.json');
const manifestPath = resolve(CATALOG_DIR, 'generated', 'manifest.json');
const yamlDir = resolve(CATALOG_DIR, 'scopes');

const scopes = JSON.parse(readFileSync(scopesPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const yaml = {};
for (const file of readdirSync(yamlDir)) {
  if (!file.endsWith('.yaml')) continue;
  const id = file.replace(/\.yaml$/, '');
  yaml[id] = readFileSync(resolve(yamlDir, file), 'utf8');
}

const schemaDir = resolve(REPO_ROOT, 'packages', 'spec', 'json-schema');
const schemas = {};
for (const file of readdirSync(schemaDir)) {
  if (!file.endsWith('.json')) continue;
  const id = file.replace(/\.json$/, '');
  schemas[id] = JSON.parse(readFileSync(resolve(schemaDir, file), 'utf8'));
}

const outDir = resolve(APP_DIR, '.generated');
mkdirSync(outDir, { recursive: true });

writeFileSync(
  resolve(outDir, 'catalog.json'),
  JSON.stringify({ scopes, manifest, yaml }, null, 2),
);
writeFileSync(
  resolve(outDir, 'schemas.json'),
  JSON.stringify(schemas, null, 2),
);

console.log(
  `Bundled ${scopes.length} scopes, ${Object.keys(yaml).length} YAML files, ${Object.keys(schemas).length} JSON schemas → .generated/`,
);
