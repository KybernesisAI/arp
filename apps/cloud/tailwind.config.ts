import type { Config } from 'tailwindcss';

/**
 * ARP design-system v0 — Phase 8.75.
 *
 * Every token here maps to a row in `docs/ARP-design-system.md`. Components
 * must reference these tokens (or the CSS vars in `app/globals.css`) rather
 * than hardcoded hex values.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1.5rem',
        sm: '1.5rem',
        lg: '2rem',
      },
    },
    extend: {
      colors: {
        neutral: {
          0: '#ffffff',
          50: '#f8fafc',
          100: '#e2e8f0',
          200: '#cbd5e1',
          300: '#94a3b8',
          400: '#64748b',
          500: '#475569',
          600: '#334155',
          700: '#1e293b',
          800: '#111827',
          900: '#0f172a',
          950: '#020617',
        },
        accent: {
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        success: { 500: '#10b981' },
        warn: { 500: '#f59e0b' },
        danger: { 500: '#ef4444' },
        surface: {
          DEFAULT: '#0f172a',
          raised: '#111827',
          elevated: '#1e293b',
          inverse: '#f8fafc',
        },
        foreground: {
          primary: '#e2e8f0',
          secondary: '#cbd5e1',
          muted: '#94a3b8',
          subtle: '#64748b',
          inverse: '#0f172a',
        },
        border: {
          DEFAULT: '#334155',
          subtle: '#1e293b',
          strong: '#475569',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace',
        ],
      },
      fontSize: {
        'display-xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-lg': ['3.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-md': ['3rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        h1: ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        h2: ['1.875rem', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        h3: ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        h4: ['1.25rem', { lineHeight: '1.4' }],
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        body: ['1rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.55' }],
        caption: ['0.75rem', { lineHeight: '1.5' }],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.25)',
        DEFAULT: '0 4px 12px -2px rgb(0 0 0 / 0.35)',
        md: '0 4px 12px -2px rgb(0 0 0 / 0.35)',
        lg: '0 16px 32px -8px rgb(0 0 0 / 0.45)',
        ring: '0 0 0 1px rgb(148 163 184 / 0.18)',
        focus: '0 0 0 2px rgb(59 130 246 / 0.6)',
      },
      transitionTimingFunction: {
        'out-snap': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-soft': 'cubic-bezier(0.4, 0, 0.2, 1)',
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        snap: '100ms',
        'ease-out': '150ms',
        'ease-in-out': '200ms',
        smooth: '300ms',
      },
      maxWidth: {
        'container-sm': '40rem',
        'container-md': '48rem',
        'container-lg': '64rem',
        'container-xl': '75rem',
        'container-wide': '90rem',
      },
      spacing: {
        section: '6rem',
        'section-sm': '4rem',
      },
    },
  },
  plugins: [],
};

export default config;
