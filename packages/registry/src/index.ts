/**
 * @kybernesis/arp-registry — agent-local SQLite store for Connection Tokens,
 * spend windows, and revocations.
 *
 * One database per running agent; better-sqlite3 synchronous writes are
 * wrapped in an async API for call-site uniformity.
 */

export { openRegistry, type Registry, type RegistryOptions } from './registry.js';
export { REGISTRY_SCHEMA_SQL } from './schema.js';
export {
  registryError,
  RegistryError_ as RegistryError,
  type RegistryErrorCode,
} from './errors.js';
export type {
  ConnectionFilter,
  ConnectionRecord,
  ConnectionStatus,
  CreateConnectionInput,
  Revocation,
  RevocationType,
} from './types.js';
