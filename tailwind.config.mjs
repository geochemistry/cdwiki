/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#fdf8f0',
          100: '#f5e6c8',
          200: '#e8cfa0',
          300: '#d4b06e',
          400: '#c49645',
          500: '#b07d2a',
          600: '#96651e',
          700: '#7a4f1a',
          800: '#5e3b16',
          900: '#3d2610',
        },
      },
    },
  },
  plugins: [],
};
