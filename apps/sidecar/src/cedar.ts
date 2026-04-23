import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

export function resolveCedarSchema(): string {
  const override = process.env.ARP_CEDAR_SCHEMA_PATH;
  if (override && existsSync(override)) {
    return readFileSync(override, 'utf8');
  }
  const schemaPath = require_.resolve('@kybernesis/arp-spec/cedar-schema.json');
  return readFileSync(schemaPath, 'utf8');
}
