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
        primary: {
          100: "var(--primary-100)",
          200: "var(--primary-200)",
          300: "var(--primary-300)",
        },
        accent: {
          100: "var(--accent-100)",
          200: "var(--accent-200)",
        },
        text: {
          100: "var(--text-100)",
          200: "var(--text-200)",
        },
        bg: {
          100: "var(--bg-100)",
          200: "var(--bg-200)",
          300: "var(--bg-300)",
        },
      },
    },
  },
  darkMode: "class",
  plugins: [nextui({
    themes: {
      light: {
        colors: {
          background: "#fffefb",
          foreground: "#1d1c1c",
          primary: {
            50: "#d4eaf7",
            100: "#b6ccd8",
            200: "#71c4ef",
            300: "#00668c",
            400: "#005a7a",
            500: "#004c68",
            600: "#003e56",
            700: "#003044",
            800: "#002232",
            900: "#001420",
            DEFAULT: "#00668c",
            foreground: "#fffefb",
          },
          focus: "#71c4ef",
          content1: "#fffefb",
          content2: "#f5f4f1",
          content3: "#cccbc8",
          content4: "#313d44",
          success: {
            DEFAULT: "#10b981",
            foreground: "#fffefb",
          },
          warning: {
            DEFAULT: "#f59e0b",
            foreground: "#fffefb",
          },
          danger: {
            DEFAULT: "#ef4444",
            foreground: "#fffefb",
          },
        },
      },
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
};