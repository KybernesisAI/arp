/**
 * @kybernesis/arp-cloud-bridge — public API.
 *
 * Programmatic use:
 *
 *   import { startBridge, createKyberBotAdapter } from '@kybernesis/arp-cloud-bridge';
 *
 *   await startBridge({
 *     handoffPath: '~/atlas/arp-handoff.json',
 *     adapter: createKyberBotAdapter({ root: '~/atlas' }),
 *   });
 *
 * For most users the CLI (`npx @kybernesis/arp-cloud-bridge ...`) is
 * what you want.
 */

export { startBridge, type BridgeHandle } from './bridge.js';
export type { Adapter, InboundContext, BridgeOptions } from './types.js';
export {
  createKyberBotAdapter,
  type KyberBotAdapterOptions,
} from './adapters/kyberbot.js';
export {
  createGenericHttpAdapter,
  type GenericHttpAdapterOptions,
} from './adapters/generic-http.js';
