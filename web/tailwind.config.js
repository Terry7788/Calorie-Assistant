const { nextui } = require("@nextui-org/react");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  darkMode: "class",
  plugins: [nextui({
    themes: {
      dark: {
        colors: {
          background: "#171717",
          foreground: "#e6e6e6",
          primary: {
            50: "#f0fdf4",
            100: "#dcfce7",
            200: "#bbf7d0",
            300: "#86efac",
            400: "#4ade80",
            500: "#7bd389",
            600: "#4caf6a",
            700: "#15803d",
            800: "#166534",
            900: "#14532d",
            DEFAULT: "#7bd389",
            foreground: "#0a0a0a",
          },
          success: {
            DEFAULT: "#7bd389",
            foreground: "#0a0a0a",
          },
          danger: {
            DEFAULT: "#ff6b6b",
            foreground: "#0a0a0a",
          },
        },
      },
    },
  })],
}
