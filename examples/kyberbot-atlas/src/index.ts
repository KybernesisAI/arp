/**
 * examples/kyberbot-atlas — minimal "KyberBot backed by ARP" wiring.
 *
 * Illustrates the withArp() drop-in for KyberBot. Run against a real
 * KyberBot build by installing `kyberbot` and replacing `new FakeBot(...)`
 * with `new KyberBot(...)`. The full end-to-end test lives under
 * `tests/phase-6/adapter-conformance.test.ts`.
 */

import { withArp } from '@kybernesis/arp-adapter-kyberbot';
import type {
  KyberBotLike,
  KyberBotMessageHandler,
  KyberBotResponseFilter,
  KyberBotToolMiddleware,
} from '@kybernesis/arp-adapter-kyberbot';

class FakeBot implements KyberBotLike {
  public readonly id = 'atlas-demo';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onMessage(_handler: KyberBotMessageHandler) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  useToolMiddleware(_mw: KyberBotToolMiddleware) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  useResponseFilter(_fn: KyberBotResponseFilter) {}
  log(level: string, msg: string) {
    // eslint-disable-next-line no-console
    console.log(`[${level}] ${msg}`);
  }
  async start() {}
  async stop() {}
}

export async function buildAtlasBot() {
  const bot = new FakeBot();
  const guarded = withArp(bot, {
    handoff: './arp-handoff.json',
    dataDir: './.arp-data',
    port: 4510,
  });
  return guarded;
}
