import type { Config } from "tailwindcss";

// Minimal Tailwind setup for Phase 1. The design system (shadcn/ui tokens, etc.)
// is fleshed out in Phase 3 (docs/05-ux-ui.md).
const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
