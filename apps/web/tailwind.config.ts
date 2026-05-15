import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../shared/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', 'monospace'],
      },
      fontSize: {
        'display': ['3rem', { lineHeight: '3.25rem', fontWeight: '700' }],
        'h1': ['2.25rem', { lineHeight: '2.625rem', fontWeight: '700' }],
        'h2': ['1.75rem', { lineHeight: '2.25rem', fontWeight: '600' }],
        'h3': ['1.375rem', { lineHeight: '1.875rem', fontWeight: '600' }],
        'h4': ['1.125rem', { lineHeight: '1.625rem', fontWeight: '500' }],
        'body-lg': ['1.0625rem', { lineHeight: '1.75rem' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        'price': ['1.5rem', { lineHeight: '1.875rem', fontWeight: '700' }],
      },
      colors: {
        brand: {
          primary: 'var(--brand-primary)',
          accent: 'var(--brand-accent)',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

export default config
