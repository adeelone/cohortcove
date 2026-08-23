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
          muted: "#7A7168",
          border: "#E7DFD3",
          accent: "#D9622B", // warm ember accent for CTAs and date blocks
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
