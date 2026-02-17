import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

/**
 * Nexus RTP Design System - Tailwind Preset
 * 
 * This preset implements the design tokens defined in design-tokens.json
 * and provides a consistent design language across all Nexus UI components.
 * 
 * @see ../../../design/tokens/design-tokens.json
 */
export const nexusPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // Primary - Navy Blue
        primary: {
          50: 'var(--color-primary-50, #E6F0FA)',
          100: 'var(--color-primary-100, #C2D9F2)',
          200: 'var(--color-primary-200, #9AC0E8)',
          300: 'var(--color-primary-300, #6FA3DB)',
          400: 'var(--color-primary-400, #4A89CF)',
          500: 'var(--color-primary-500, #2563EB)',
          600: 'var(--color-primary-600, #1D4ED8)',
          700: 'var(--color-primary-700, #1E40AF)',
          800: 'var(--color-primary-800, #1E3A8A)',
          900: 'var(--color-primary-900, #1A1A2E)',
          DEFAULT: 'var(--color-primary-500, #2563EB)',
        },
        // Secondary - Teal
        secondary: {
          50: 'var(--color-secondary-50, #F0FDFA)',
          100: 'var(--color-secondary-100, #CCFBF1)',
          200: 'var(--color-secondary-200, #99F6E4)',
          300: 'var(--color-secondary-300, #5EEAD4)',
          400: 'var(--color-secondary-400, #2DD4BF)',
          500: 'var(--color-secondary-500, #14B8A6)',
          600: 'var(--color-secondary-600, #0D9488)',
          700: 'var(--color-secondary-700, #0F766E)',
          800: 'var(--color-secondary-800, #115E59)',
          900: 'var(--color-secondary-900, #134E4A)',
          DEFAULT: 'var(--color-secondary-500, #14B8A6)',
        },
        // Accent - Gold
        accent: {
          light: 'var(--color-accent-light, #FCD34D)',
          DEFAULT: 'var(--color-accent, #F59E0B)',
          dark: 'var(--color-accent-dark, #D97706)',
        },
        // Semantic Colors
        success: {
          50: 'var(--color-success-50, #F0FDF4)',
          100: 'var(--color-success-100, #DCFCE7)',
          500: 'var(--color-success-500, #22C55E)',
          600: 'var(--color-success-600, #16A34A)',
          700: 'var(--color-success-700, #15803D)',
          DEFAULT: 'var(--color-success-500, #22C55E)',
        },
        warning: {
          50: 'var(--color-warning-50, #FFFBEB)',
          100: 'var(--color-warning-100, #FEF3C7)',
          500: 'var(--color-warning-500, #F59E0B)',
          600: 'var(--color-warning-600, #D97706)',
          700: 'var(--color-warning-700, #B45309)',
          DEFAULT: 'var(--color-warning-500, #F59E0B)',
        },
        danger: {
          50: 'var(--color-danger-50, #FEF2F2)',
          100: 'var(--color-danger-100, #FEE2E2)',
          500: 'var(--color-danger-500, #EF4444)',
          600: 'var(--color-danger-600, #DC2626)',
          700: 'var(--color-danger-700, #B91C1C)',
          DEFAULT: 'var(--color-danger-500, #EF4444)',
        },
        info: {
          50: 'var(--color-info-50, #EFF6FF)',
          100: 'var(--color-info-100, #DBEAFE)',
          500: 'var(--color-info-500, #3B82F6)',
          600: 'var(--color-info-600, #2563EB)',
          700: 'var(--color-info-700, #1D4ED8)',
          DEFAULT: 'var(--color-info-500, #3B82F6)',
        },
        // Neutral palette
        neutral: {
          0: 'var(--color-neutral-0, #FFFFFF)',
          50: 'var(--color-neutral-50, #F8FAFC)',
          100: 'var(--color-neutral-100, #F1F5F9)',
          200: 'var(--color-neutral-200, #E2E8F0)',
          300: 'var(--color-neutral-300, #CBD5E1)',
          400: 'var(--color-neutral-400, #94A3B8)',
          500: 'var(--color-neutral-500, #64748B)',
          600: 'var(--color-neutral-600, #475569)',
          700: 'var(--color-neutral-700, #334155)',
          800: 'var(--color-neutral-800, #1E293B)',
          900: 'var(--color-neutral-900, #0F172A)',
          950: 'var(--color-neutral-950, #020617)',
        },
        // Semantic shortcuts
        background: 'var(--color-background, #F8FAFC)',
        foreground: 'var(--color-foreground, #0F172A)',
        muted: {
          DEFAULT: 'var(--color-muted, #F1F5F9)',
          foreground: 'var(--color-muted-foreground, #64748B)',
        },
        card: {
          DEFAULT: 'var(--color-card, #FFFFFF)',
          foreground: 'var(--color-card-foreground, #0F172A)',
        },
        border: 'var(--color-border, #E2E8F0)',
        input: 'var(--color-input, #E2E8F0)',
        ring: 'var(--color-ring, #2563EB)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'Consolas',
          'Monaco',
          'Courier New',
          'monospace',
        ],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        '6xl': ['3.75rem', { lineHeight: '1' }],
      },
      borderRadius: {
        none: '0',
        sm: '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
      },
      transitionDuration: {
        fast: '100ms',
        normal: '150ms',
        slow: '200ms',
        slower: '300ms',
        slowest: '500ms',
      },
      transitionTimingFunction: {
        'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
        'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      zIndex: {
        hide: '-1',
        base: '0',
        dropdown: '1000',
        sticky: '1100',
        overlay: '1200',
        modal: '1300',
        popover: '1400',
        toast: '1500',
        tooltip: '1600',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'slide-in-from-top': {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(0)' },
        },
        'slide-in-from-bottom': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'slide-in-from-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-from-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { transform: 'scale(0.95)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        'scale-out': {
          from: { transform: 'scale(1)', opacity: '1' },
          to: { transform: 'scale(0.95)', opacity: '0' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'fade-out': 'fade-out 150ms ease-in',
        'slide-in-from-top': 'slide-in-from-top 200ms ease-out',
        'slide-in-from-bottom': 'slide-in-from-bottom 200ms ease-out',
        'slide-in-from-left': 'slide-in-from-left 200ms ease-out',
        'slide-in-from-right': 'slide-in-from-right 200ms ease-out',
        'scale-in': 'scale-in 150ms ease-out',
        'scale-out': 'scale-out 100ms ease-in',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        spin: 'spin 1s linear infinite',
        'accordion-down': 'accordion-down 200ms ease-out',
        'accordion-up': 'accordion-up 200ms ease-out',
      },
    },
  },
  plugins: [
    plugin(function ({ addBase, addUtilities }) {
      // Add CSS custom properties
      addBase({
        ':root': {
          // Primary palette
          '--color-primary-50': '#E6F0FA',
          '--color-primary-100': '#C2D9F2',
          '--color-primary-200': '#9AC0E8',
          '--color-primary-300': '#6FA3DB',
          '--color-primary-400': '#4A89CF',
          '--color-primary-500': '#2563EB',
          '--color-primary-600': '#1D4ED8',
          '--color-primary-700': '#1E40AF',
          '--color-primary-800': '#1E3A8A',
          '--color-primary-900': '#1A1A2E',
          // Secondary palette
          '--color-secondary-50': '#F0FDFA',
          '--color-secondary-100': '#CCFBF1',
          '--color-secondary-200': '#99F6E4',
          '--color-secondary-300': '#5EEAD4',
          '--color-secondary-400': '#2DD4BF',
          '--color-secondary-500': '#14B8A6',
          '--color-secondary-600': '#0D9488',
          '--color-secondary-700': '#0F766E',
          '--color-secondary-800': '#115E59',
          '--color-secondary-900': '#134E4A',
          // Accent
          '--color-accent': '#F59E0B',
          '--color-accent-light': '#FCD34D',
          '--color-accent-dark': '#D97706',
          // Semantic
          '--color-success-50': '#F0FDF4',
          '--color-success-100': '#DCFCE7',
          '--color-success-500': '#22C55E',
          '--color-success-600': '#16A34A',
          '--color-success-700': '#15803D',
          '--color-warning-50': '#FFFBEB',
          '--color-warning-100': '#FEF3C7',
          '--color-warning-500': '#F59E0B',
          '--color-warning-600': '#D97706',
          '--color-warning-700': '#B45309',
          '--color-danger-50': '#FEF2F2',
          '--color-danger-100': '#FEE2E2',
          '--color-danger-500': '#EF4444',
          '--color-danger-600': '#DC2626',
          '--color-danger-700': '#B91C1C',
          '--color-info-50': '#EFF6FF',
          '--color-info-100': '#DBEAFE',
          '--color-info-500': '#3B82F6',
          '--color-info-600': '#2563EB',
          '--color-info-700': '#1D4ED8',
          // Neutral
          '--color-neutral-0': '#FFFFFF',
          '--color-neutral-50': '#F8FAFC',
          '--color-neutral-100': '#F1F5F9',
          '--color-neutral-200': '#E2E8F0',
          '--color-neutral-300': '#CBD5E1',
          '--color-neutral-400': '#94A3B8',
          '--color-neutral-500': '#64748B',
          '--color-neutral-600': '#475569',
          '--color-neutral-700': '#334155',
          '--color-neutral-800': '#1E293B',
          '--color-neutral-900': '#0F172A',
          '--color-neutral-950': '#020617',
          // Semantic shortcuts
          '--color-background': '#F8FAFC',
          '--color-foreground': '#0F172A',
          '--color-muted': '#F1F5F9',
          '--color-muted-foreground': '#64748B',
          '--color-card': '#FFFFFF',
          '--color-card-foreground': '#0F172A',
          '--color-border': '#E2E8F0',
          '--color-input': '#E2E8F0',
          '--color-ring': '#2563EB',
          // Focus ring
          '--focus-ring-width': '2px',
          '--focus-ring-offset': '2px',
          '--focus-ring-color': 'var(--color-ring)',
        },
        // Dark mode
        '.dark': {
          '--color-background': '#0F172A',
          '--color-foreground': '#F8FAFC',
          '--color-muted': '#1E293B',
          '--color-muted-foreground': '#94A3B8',
          '--color-card': '#1E293B',
          '--color-card-foreground': '#F8FAFC',
          '--color-border': '#334155',
          '--color-input': '#334155',
        },
      });

      // Accessibility utilities
      addUtilities({
        '.focus-ring': {
          outline: 'none',
          '&:focus-visible': {
            boxShadow: '0 0 0 var(--focus-ring-offset) var(--color-background), 0 0 0 calc(var(--focus-ring-width) + var(--focus-ring-offset)) var(--focus-ring-color)',
          },
        },
        '.sr-only': {
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: '0',
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: '0',
        },
        '.not-sr-only': {
          position: 'static',
          width: 'auto',
          height: 'auto',
          padding: '0',
          margin: '0',
          overflow: 'visible',
          clip: 'auto',
          whiteSpace: 'normal',
        },
      });
    }),
  ],
};

export default nexusPreset;
