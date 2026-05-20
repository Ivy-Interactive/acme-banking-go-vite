import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef5ff',
          100: '#d9e7ff',
          200: '#b6cfff',
          300: '#85aeff',
          400: '#5689ff',
          500: '#2f64f5',
          600: '#1d4ad8',
          700: '#1a3bae',
          800: '#1a3389',
          900: '#1a2e6e',
          950: '#101b44',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
