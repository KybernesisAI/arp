/**
 * @kybernesis/arp-cloud-client — outbound client for ARP Cloud.
 *
 * Tiny by design (≤500 source LOC). Opens a WebSocket to cloud.arp.run,
 * relays inbound DIDComm envelopes to a locally running agent, pushes
 * local replies back out. Exponential backoff reconnect. Hourly
 * token rotation. No DIDComm imports — the cloud verified the
 * envelope; the client just transports bytes.
 */

export { createCloudClient } from './client.js';
export {
  loadConfig,
  readConfigFile,
  writeConfigFile,
  writePrivateKey,
  defaultConfigPath,
  defaultConfigDir,
  expandHome,
} from './config.js';
export { signBearerToken } from './auth.js';
export type {
  CloudClientConfig,
  CloudClientHandle,
  CloudClientState,
  WebSocketLike,
  WebSocketInstance,
} from './types.js';
export type { CloudClientConfigFile, LoadedConfig } from './config.js';
