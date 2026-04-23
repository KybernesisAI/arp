import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        arp: {
          bg: '#0b0e14',
          surface: '#11161f',
          border: '#1f2937',
          text: '#e5e7eb',
          muted: '#9ca3af',
          accent: '#7dd3fc',
          danger: '#f87171',
          warn: '#fbbf24',
          ok: '#34d399',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
