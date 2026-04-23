/**
 * examples/hermes-demo — minimal Hermes-Agent + ARP wiring.
 */

import { withArp } from '@kybernesis/arp-adapter-hermes-agent';
import type {
  HermesAgentLike,
  HermesEgress,
  HermesPeerMessageHandler,
  HermesToolMiddleware,
} from '@kybernesis/arp-adapter-hermes-agent';

class FakeHermes implements HermesAgentLike {
  public readonly id = 'hermes-demo';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  useToolMiddleware(_mw: HermesToolMiddleware) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onPeerMessage(_h: HermesPeerMessageHandler) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  useEgress(_fn: HermesEgress) {}
  emit() {}
  async start() {}
  async stop() {}
}

export function buildHermesDemo() {
  const hermes = new FakeHermes();
  return withArp(hermes, {
    handoff: './arp-handoff.json',
    dataDir: './.arp-data',
    port: 4512,
  });
}
