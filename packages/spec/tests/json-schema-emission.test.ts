import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { SCHEMA_REGISTRY, SCHEMA_BASE_URL, ARP_VERSION } from '../src/index.js';

const JSON_SCHEMA_DIR = resolve(__dirname, '..', 'json-schema');

describe('emitted JSON Schemas', () => {
  beforeAll(() => {
    if (!existsSync(JSON_SCHEMA_DIR)) {
      throw new Error(
        `json-schema/ not found at ${JSON_SCHEMA_DIR}. Run \`pnpm --filter @kybernesis/arp-spec build\` first.`
      );
    }
  });

  it('emits one JSON file per registry entry', () => {
    const files = readdirSync(JSON_SCHEMA_DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(Object.keys(SCHEMA_REGISTRY).length);
  });

  it.each(Object.keys(SCHEMA_REGISTRY))(
    'emits draft-2020-12 schema with stable $id for %s',
    (name) => {
      const filePath = resolve(JSON_SCHEMA_DIR, `${name}.json`);
      const raw = readFileSync(filePath, 'utf8');
      const doc = JSON.parse(raw);
      expect(doc.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(doc.$id).toBe(`${SCHEMA_BASE_URL}/${name}/v${ARP_VERSION}.json`);
      expect(doc.title).toBe(name);
    }
  );

  it.each(Object.keys(SCHEMA_REGISTRY))('is loadable as a draft-2020-12 schema (%s)', (name) => {
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    const filePath = resolve(JSON_SCHEMA_DIR, `${name}.json`);
    const doc = JSON.parse(readFileSync(filePath, 'utf8'));
    const validate = ajv.compile(doc);
    expect(typeof validate).toBe('function');
  });
});
