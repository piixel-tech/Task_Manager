import type { Config } from 'tailwindcss';

/**
 * Design-system tokens for Task Manager.
 *
 * The runtime source of truth is `src/styles/theme.css` — every value below
 * points at a CSS custom property declared there, so the accent-theme switcher
 * (Forest / Ocean / Plum / Ember) can repaint the whole app by swapping
 * variables on <html data-accent="…"> without a rebuild.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Plus Jakarta Sans',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif'
        ]
      },
      colors: {
        canvas: 'var(--tm-bg)',
        sunken: 'var(--tm-bg-sunken)',
        card: 'var(--tm-card)',
        'card-muted': 'var(--tm-card-muted)',
        line: 'var(--tm-border)',
        'line-strong': 'var(--tm-border-strong)',

        ink: 'var(--tm-ink)',
        'ink-soft': 'var(--tm-ink-soft)',
        'ink-muted': 'var(--tm-ink-muted)',

        primary: {
          DEFAULT: 'var(--tm-primary)',
          dark: 'var(--tm-primary-dark)',
          light: 'var(--tm-primary-light)',
          soft: 'var(--tm-primary-soft)',
          softer: 'var(--tm-primary-softer)'
        },
        'on-primary': 'var(--tm-on-primary)',

        ok: 'var(--tm-success)',
        'ok-bg': 'var(--tm-success-bg)',
        'ok-ring': 'var(--tm-success-ring)',
        warn: 'var(--tm-warning)',
        'warn-bg': 'var(--tm-warning-bg)',
        'warn-ring': 'var(--tm-warning-ring)',
        bad: 'var(--tm-danger)',
        'bad-bg': 'var(--tm-danger-bg)',
        'bad-ring': 'var(--tm-danger-ring)',
        info: 'var(--tm-info)',
        'info-bg': 'var(--tm-info-bg)',
        'info-ring': 'var(--tm-info-ring)',
        'neutral-soft': 'var(--tm-neutral)',
        'neutral-bg': 'var(--tm-neutral-bg)',
        'neutral-ring': 'var(--tm-neutral-ring)'
      },
      borderRadius: {
        sm2: 'var(--tm-radius-sm)',
        md2: 'var(--tm-radius-md)',
        lg2: 'var(--tm-radius-lg)',
        xl2: 'var(--tm-radius-xl)'
      },
      boxShadow: {
        'soft-xs': 'var(--tm-shadow-xs)',
        'soft-sm': 'var(--tm-shadow-sm)',
        soft: 'var(--tm-shadow-md)',
        'soft-lg': 'var(--tm-shadow-lg)',
        hero: 'var(--tm-shadow-hero)'
      },
      transitionTimingFunction: {
        soft: 'var(--tm-ease)'
      },
      transitionDuration: {
        fast: 'var(--tm-dur-fast)',
        soft: 'var(--tm-dur)',
        slow: 'var(--tm-dur-slow)'
      }
    }
  }
} satisfies Config;
