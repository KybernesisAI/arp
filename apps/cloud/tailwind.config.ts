import type { Config } from 'tailwindcss';

/**
 * ARP design-system v0 — Phase 8.75.
 *
 * Swiss / editorial aesthetic. Every token maps to a row in
 * `docs/ARP-design-system.md`. Components reference these tokens (or the
 * CSS vars in `app/globals.css`) rather than hardcoded values.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Paper / ink neutrals reference the CSS vars so a single theme
        // override (on `<html data-theme="dark">`) flips the whole surface.
        paper: 'var(--arp-paper)',
        'paper-2': 'var(--arp-paper-2)',
        ink: 'var(--arp-ink)',
        'ink-2': 'var(--arp-ink-2)',
        muted: 'var(--arp-muted)',
        rule: 'var(--arp-rule)',

        // Signal palette — direct hex since the reference document keeps
        // the accent colors identical across themes.
        signal: {
          blue: '#1536e6',
          red: '#e8371f',
          yellow: '#f2c14b',
          green: '#0f7a4a',
        },
      },
      fontFamily: {
        display: [
          'Space Grotesk',
          'Helvetica Neue',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        sans: [
          'Instrument Sans',
          'Helvetica Neue',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        'display-xl': ['7rem', { lineHeight: '0.95', letterSpacing: '-0.03em' }],
        'display-lg': ['4rem', { lineHeight: '1.02', letterSpacing: '-0.03em' }],
        'display-md': ['3rem', { lineHeight: '1.0', letterSpacing: '-0.02em' }],
        h1: ['2.75rem', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
        h2: ['2.5rem', { lineHeight: '1.0', letterSpacing: '-0.02em' }],
        h3: ['1.625rem', { lineHeight: '1.05', letterSpacing: '-0.015em' }],
        h4: ['1.5rem', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        h5: ['1.375rem', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        'body-lg': ['1.125rem', { lineHeight: '1.45' }],
        body: ['1rem', { lineHeight: '1.5' }],
        'body-sm': ['0.875rem', { lineHeight: '1.45' }],
        kicker: ['0.66rem', { lineHeight: '1.2', letterSpacing: '0.14em' }],
        micro: ['0.625rem', { lineHeight: '1.2', letterSpacing: '0.12em' }],
      },
      borderRadius: {
        none: '0',
        DEFAULT: '0',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        'focus-ring': '0 0 0 2px var(--arp-ink)',
      },
      transitionDuration: {
        fast: '160ms',
        std: '420ms',
      },
      transitionTimingFunction: {
        'arp': 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      },
      maxWidth: {
        page: '1440px',
      },
      spacing: {
        'section-tight': '6rem',
        section: '8rem',
        'section-loose': '11rem',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        reveal: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pulse: 'pulse 1.6s ease-in-out infinite',
        ticker: 'ticker 60s linear infinite',
        reveal: 'reveal 420ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
