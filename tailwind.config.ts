import type { Config } from "tailwindcss";

// Visual direction (see brief): warm neutrals + one energetic accent,
// editorial event cards, clear date blocks. Colors are CSS variables
// (see globals.css) so an institution on a paid plan can swap the accent
// for its own brand color without a rebuild.
const withVar = (name: string) => `rgb(var(--cove-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cove: {
          bg: withVar("bg"),
          surface: withVar("surface"),
          sunken: withVar("sunken"),
          ink: withVar("ink"),
          // WCAG 2.2 AA requires >=4.5:1 for normal text; verified against
          // both cove-bg and cove-surface (6.18:1 / 6.65:1).
          muted: withVar("muted"),
          border: withVar("border"),
          // Default accent passes AA as a background for white text (5.53:1)
          // and as text on bg/surface (5.14:1 / 5.53:1). Custom accents are
          // contrast-checked when an admin saves them.
          accent: withVar("accent"),
          accentInk: withVar("accent-ink"),
          success: withVar("success"),
          warning: withVar("warning"),
          danger: withVar("danger"),
          info: withVar("info"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(43 38 32 / 0.04), 0 4px 16px -8px rgb(43 38 32 / 0.08)",
        lift: "0 2px 4px rgb(43 38 32 / 0.05), 0 16px 32px -12px rgb(43 38 32 / 0.18)",
      },
      maxWidth: {
        page: "72rem",
      },
    },
  },
  plugins: [],
};

export default config;
