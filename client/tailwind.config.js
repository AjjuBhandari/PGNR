/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mc: {
          bg: "#16181c",
          panel: "#1e2126",
          border: "#2c3038",
          green: "#5EBB52",
          gold: "#FFAA00",
          red: "#FF5555",
          purple: "#AA00AA",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
