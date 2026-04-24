import type { Config } from 'tailwindcss';
import arpPreset from '@kybernesis/arp-ui/tailwind-preset';

/**
 * ARP Cloud web app — consumes the shared design-system preset from
 * `@kybernesis/arp-ui`. Token rows are documented in
 * `docs/ARP-design-system.md`; the canonical source is
 * `packages/ui/src/tailwind-preset.ts`. Overrides here are reserved for
 * cloud-specific extensions (none today).
 */
const config: Config = {
  presets: [arpPreset as Partial<Config>],
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
};

export default config;
