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
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
