/**
 * @kybernesis/arp-sidecar — packaged runtime that Kybernesis agents install via
 * Docker or systemd. Wraps @kybernesis/arp-runtime with first-boot bootstrap,
 * CLI, health checks, and graceful shutdown.
 */

export { bootstrap, loadHandoff } from './bootstrap.js';
export type { BootstrapResult, BootstrapOptions, BootstrapPaths } from './bootstrap.js';
export { startSidecarRuntime } from './runtime.js';
export type { StartOptions, StartedRuntime } from './runtime.js';
export { checkHealth } from './health.js';
export type { HealthResponse } from './health.js';
export { createLogger } from './log.js';
export { installService, uninstallService } from './service-install.js';
