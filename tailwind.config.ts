import type { Config } from "tailwindcss";

// Visual direction (see brief): warm neutrals + one energetic accent,
// editorial event cards, clear date blocks. This is a starting palette,
// not final brand work — swap before any real launch.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cove: {
          bg: "#FAF6F0",
          surface: "#FFFFFF",
          ink: "#2B2620",
          // WCAG 2.2 AA requires >=4.5:1 for normal text; verified against
          // both cove-bg and cove-surface (6.18:1 / 6.65:1).
          muted: "#645B51",
          border: "#E7DFD3",
          // Darkened from the original #D9622B (3.66:1 with white text,
          // failing AA) to a ratio that passes as both a background (white
          // text, 5.53:1) and as accent-colored text on bg/surface (5.14:1 / 5.53:1).
          accent: "#AE4A1D",
          accentInk: "#FFFFFF",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
