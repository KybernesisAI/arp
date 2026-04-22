#!/usr/bin/env node
/**
 * Generate JSON Schema (draft 2020-12) files from the Zod schema registry.
 *
 * Invoked after `tsup` produces the compiled ESM bundle. Emits one .json file
 * per registered schema into `json-schema/`, with a stable `$id` URL.
 */
import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { SCHEMA_REGISTRY, SCHEMA_BASE_URL, ARP_VERSION } from '../dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'json-schema');

if (existsSync(OUT_DIR)) {
  for (const file of readdirSync(OUT_DIR)) {
    if (file.endsWith('.json')) unlinkSync(resolve(OUT_DIR, file));
  }
} else {
  mkdirSync(OUT_DIR, { recursive: true });
}

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';

let count = 0;
for (const [name, schema] of Object.entries(SCHEMA_REGISTRY)) {
  const json = zodToJsonSchema(schema, {
    name,
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });

  // zod-to-json-schema targets draft 2019-09 by default; rewrite to 2020-12 + $id.
  // It emits { $ref: "#/definitions/<name>", definitions: { <name>: ... } }.
  const defs = json.definitions && json.definitions[name] ? json.definitions[name] : json;
  const schemaDoc = {
    $schema: DRAFT,
    $id: `${SCHEMA_BASE_URL}/${name}/v${ARP_VERSION}.json`,
    title: name,
    ...defs,
  };

  const outPath = resolve(OUT_DIR, `${name}.json`);
  writeFileSync(outPath, `${JSON.stringify(schemaDoc, null, 2)}\n`, 'utf8');
  count += 1;
}

console.log(`emitted ${count} JSON Schema file(s) → ${OUT_DIR}`);
