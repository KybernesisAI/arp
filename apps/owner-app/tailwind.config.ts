import type { Config } from 'tailwindcss';
import arpPreset from '@kybernesis/arp-ui/tailwind-preset';

/**
 * ARP owner-app — consumes the shared design-system preset from
 * `@kybernesis/arp-ui` (Phase 10 slice 10d). The legacy `arp.*` palette is
 * preserved here so Phase-4 pages keep rendering unchanged while we re-skin
 * the chrome with the preset's `paper` / `ink` / `signal` tokens.
 */
const config: Config = {
  presets: [arpPreset as Partial<Config>],
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        arp: {
          bg: 'var(--arp-paper)',
          surface: 'var(--arp-paper-2)',
          border: 'var(--arp-rule)',
          text: 'var(--arp-ink)',
          muted: 'var(--arp-muted)',
          accent: '#1536e6',
          danger: '#e8371f',
          warn: '#f2c14b',
          ok: '#0f7a4a',
        },
      },
    },
  },
};

export default config;
