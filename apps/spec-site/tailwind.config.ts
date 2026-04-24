import type { Config } from 'tailwindcss';
import arpPreset from '@kybernesis/arp-ui/tailwind-preset';

/**
 * ARP spec site — shared design-system preset plus a handful of Fumadocs
 * content paths so utility classes used inside its MDX renderer get tree-
 * shaken alongside our own components.
 */
const config: Config = {
  presets: [arpPreset as Partial<Config>],
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.{md,mdx}',
    './lib/**/*.{ts,tsx}',
    './node_modules/fumadocs-ui/dist/**/*.js',
  ],
};

export default config;
