/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07090d",
          900: "#0b0e14",
          850: "#0f131b",
          800: "#141a24",
          700: "#1c2431",
          600: "#273040",
          500: "#3a4557",
          400: "#56626f",
          300: "#7b8794",
          200: "#a3adb8",
          100: "#cbd2da",
          50: "#eef1f4",
        },
        moss: {
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
        },
        ember: {
          400: "#fbbf24",
          500: "#f59e0b",
        },
        signal: {
          400: "#38bdf8",
          500: "#0ea5e9",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "SFMono-Regular", "ui-monospace", "Menlo", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 8px 24px -12px rgb(0 0 0 / 0.6)",
      },
    },
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")],
};