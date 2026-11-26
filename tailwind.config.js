/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pur: {
          DEFAULT: '#7136ef',
          50: '#f4efff',
          100: '#e9ddff',
          600: '#7136ef',
          700: '#5635c5',
          800: '#4326a2'
        },
        ink: {
          DEFAULT: '#0c1b3b',
          muted: '#687894',
          subtle: '#8c96ab'
        }
      }
    },
  },
  plugins: [],
}
