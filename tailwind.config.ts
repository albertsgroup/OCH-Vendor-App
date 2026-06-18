import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3e4b54',
          50:  '#ebeef0',
          100: '#d0d5d9',
          200: '#a8b2b9',
          300: '#7f8e98',
          400: '#5e6f7a',
          500: '#3e4b54',
          600: '#334049',
          700: '#28343c',
          800: '#1e272e',
          900: '#131a1f',
        },
        secondary: {
          DEFAULT: '#f0ece2',
          50:  '#fdfcfa',
          100: '#f8f5ef',
          200: '#f4f0e8',
          300: '#f0ece2',
          400: '#e8e2d5',
          500: '#ddd6c5',
          600: '#c8bfa9',
          700: '#a89e87',
          800: '#857c66',
          900: '#605a4a',
        },
        'light-grey': {
          DEFAULT: '#d1cbc1',
          50:  '#f8f7f5',
          100: '#eeece8',
          200: '#e2ddd7',
          300: '#d1cbc1',
          400: '#bbb3a7',
          500: '#a09689',
          600: '#857b6e',
          700: '#6b6358',
          800: '#524c43',
          900: '#38342e',
        },
        'och-black': {
          DEFAULT: '#263139',
          light: '#2f3d47',
          dark:  '#1c252c',
        },
      },
      fontFamily: {
        sans:    ['var(--font-sans)',    'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
