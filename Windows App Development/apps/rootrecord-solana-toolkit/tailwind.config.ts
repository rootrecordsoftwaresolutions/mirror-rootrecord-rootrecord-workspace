import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        ink: {
          900: "#06090F",
          800: "#0A0F1A",
          700: "#0F1623",
          600: "#161E2E",
          500: "#1F2937",
        },
        sol: {
          green: "#14F195",
          purple: "#9945FF",
          dim: "#0E8A57",
        },
        border: "rgba(255,255,255,0.08)",
        input: "rgba(255,255,255,0.08)",
        ring: "#14F195",
        background: "#06090F",
        foreground: "#E6EAF2",
        primary: { DEFAULT: "#14F195", foreground: "#06090F" },
        secondary: { DEFAULT: "#9945FF", foreground: "#FFFFFF" },
        muted: { DEFAULT: "#0F1623", foreground: "#9AA4B2" },
        accent: { DEFAULT: "#0F1623", foreground: "#E6EAF2" },
        destructive: { DEFAULT: "#FF5C5C", foreground: "#FFFFFF" },
        card: { DEFAULT: "#0A0F1A", foreground: "#E6EAF2" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { lg: "14px", md: "10px", sm: "6px" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
