/**
 * examples/nanoclaw-demo — minimal NanoClaw + ARP integration.
 *
 * Demonstrates both shapes the adapter supports:
 *
 *   1. Wrap a plain async tool with `arpGuardedTool` — handy in edge /
 *      FaaS deployments where NanoClaw just imports and runs functions.
 *
 *   2. Register middleware + inbound handler via `withArp(nano, opts)` —
 *      use when NanoClaw exposes a plugin-style extension point.
 */

import { ArpAgent } from '@kybernesis/arp-sdk';
import {
  arpGuardedTool,
  withArp,
  type NanoClawLike,
  type NanoInboundHandler,
  type NanoToolWrapper,
} from '@kybernesis/arp-adapter-nanoclaw';

class FakeNano implements NanoClawLike {
  public readonly id = 'nano-demo';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  registerToolWrapper(_w: NanoToolWrapper) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onInbound(_h: NanoInboundHandler) {}
  async start() {}
  async stop() {}
}

export async function buildNanoDemo(agent: ArpAgent, connectionId: string) {
  // Shape 1: guarded plain function.
  const searchGuarded = arpGuardedTool(
    agent,
    { connectionId, toolName: 'search' },
    async (args: { q: string }) => ({ results: [`hit-for-${args.q}`] }),
  );

  // Shape 2: withArp() over a NanoClaw-like host.
  const nano = new FakeNano();
  withArp(nano, { agent, outboundOnly: true });

  return { nano, searchGuarded };
}
