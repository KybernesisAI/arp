/**
 * examples/openclaw-demo — minimal OpenClaw + ARP wiring.
 *
 * Shows the arpPlugin() drop-in for OpenClaw. Swap `FakeFramework` for a
 * real OpenClaw import. See `../../adapters/openclaw/MIGRATION.md`.
 */

import { arpPlugin } from '@kybernesis/arp-adapter-openclaw';
import type { OpenClawLike, OpenClawPlugin } from '@kybernesis/arp-adapter-openclaw';

class FakeFramework implements OpenClawLike {
  public readonly plugins: OpenClawPlugin[] = [];
  public readonly logger = {
    info: (msg: string) => {
      // eslint-disable-next-line no-console
      console.log(`[info] ${msg}`);
    },
    warn: (msg: string) => {
      // eslint-disable-next-line no-console
      console.warn(`[warn] ${msg}`);
    },
    error: (msg: string) => {
      // eslint-disable-next-line no-console
      console.error(`[error] ${msg}`);
    },
  };
  use(p: OpenClawPlugin) {
    this.plugins.push(p);
    return this;
  }
  async start() {}
  async stop() {}
}

export function buildDemo() {
  const f = new FakeFramework();
  f.use(
    arpPlugin({
      handoff: './arp-handoff.json',
      dataDir: './.arp-data',
      port: 4511,
    }),
  );
  return f;
}
