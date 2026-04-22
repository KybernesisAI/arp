import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  buildDidDocument,
  buildAgentCard,
  buildHandoffBundle,
} from '@kybernesis/arp-templates';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SPEC_JSON_SCHEMA_DIR = resolve(__dirname, '../../packages/spec/json-schema');

function loadJsonSchema(name: string): object {
  return JSON.parse(readFileSync(resolve(SPEC_JSON_SCHEMA_DIR, `${name}.json`), 'utf8'));
}

const didDocumentJsonSchema = loadJsonSchema('did-document');
const agentCardJsonSchema = loadJsonSchema('agent-card');
const handoffBundleJsonSchema = loadJsonSchema('handoff-bundle');

describe('Phase 1 acceptance: templates produce documents that validate against the emitted JSON Schemas', () => {
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);

  it('buildDidDocument → did-document.json', () => {
    const doc = buildDidDocument({
      agentDid: 'did:web:samantha.agent',
      controllerDid: 'did:web:ian.self.xyz',
      publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
      endpoints: {
        didcomm: 'https://samantha.agent/didcomm',
        agentCard: 'https://samantha.agent/.well-known/agent-card.json',
      },
      representationVcUrl: 'https://ian.samantha.agent/.well-known/representation.jwt',
    });
    const validate = ajv.compile(didDocumentJsonSchema as object);
    const valid = validate(doc);
    if (!valid) {
      throw new Error(`did-document failed JSON Schema validation: ${ajv.errorsText(validate.errors)}`);
    }
    expect(valid).toBe(true);
  });

  it('buildAgentCard → agent-card.json', () => {
    const card = buildAgentCard({
      name: 'Samantha',
      did: 'did:web:samantha.agent',
      endpoints: {
        didcomm: 'https://samantha.agent/didcomm',
        pairing: 'https://samantha.agent/pair',
      },
      agentOrigin: 'https://samantha.agent',
    });
    const validate = ajv.compile(agentCardJsonSchema as object);
    const valid = validate(card);
    if (!valid) {
      throw new Error(`agent-card failed JSON Schema validation: ${ajv.errorsText(validate.errors)}`);
    }
    expect(valid).toBe(true);
  });

  it('buildHandoffBundle → handoff-bundle.json', () => {
    const bundle = buildHandoffBundle({
      agentDid: 'did:web:samantha.agent',
      principalDid: 'did:web:ian.self.xyz',
      publicKeyMultibase: 'z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp',
      agentOrigin: 'https://samantha.agent',
      dnsRecordsPublished: [
        'A',
        'AAAA',
        '_arp TXT',
        '_did TXT',
        '_didcomm TXT',
        '_revocation TXT',
        '_principal TXT',
      ],
      certExpiresAt: '2026-07-22T00:00:00Z',
      bootstrapToken: 'eyJhbGciOiJFZERTQSJ9.payload.sig',
    });
    const validate = ajv.compile(handoffBundleJsonSchema as object);
    const valid = validate(bundle);
    if (!valid) {
      throw new Error(`handoff-bundle failed JSON Schema validation: ${ajv.errorsText(validate.errors)}`);
    }
    expect(valid).toBe(true);
  });
});
