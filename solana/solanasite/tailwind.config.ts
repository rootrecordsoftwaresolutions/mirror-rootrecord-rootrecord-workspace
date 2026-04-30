import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        // Deep crypto-native palette
        ink: {
          900: '#06090F',
          800: '#0A0F1A',
          700: '#0F1623',
          600: '#161E2E',
          500: '#1F2937',
        },
        sol: {
          green: '#14F195',
          purple: '#9945FF',
          dim: '#0E8A57',
        },
        // shadcn semantic
        border: 'rgba(255,255,255,0.08)',
        input: 'rgba(255,255,255,0.08)',
        ring: '#14F195',
        background: '#06090F',
        foreground: '#E6EAF2',
        primary: { DEFAULT: '#14F195', foreground: '#06090F' },
        secondary: { DEFAULT: '#9945FF', foreground: '#FFFFFF' },
        muted: { DEFAULT: '#0F1623', foreground: '#9AA4B2' },
        accent: { DEFAULT: '#0F1623', foreground: '#E6EAF2' },
        destructive: { DEFAULT: '#FF5C5C', foreground: '#FFFFFF' },
        card: { DEFAULT: '#0A0F1A', foreground: '#E6EAF2' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { lg: '14px', md: '10px', sm: '6px' },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(20,241,149,0.0)' },
          '50%': { boxShadow: '0 0 0 8px rgba(20,241,149,0.08)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        'pulse-glow': 'pulse-glow 2.4s ease-in-out infinite',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
