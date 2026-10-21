import { defineConfig } from "@auto-design/core";

/**
 * Quiet: for B2B software and dashboards. Ink on white, cool grays, hairline
 * rings and soft shadows, motion you notice only when it's missing. Color is
 * left to status and data, so the product's own content leads.
 */
export default defineConfig({
  name: "quiet",
  displayName: "Quiet",
  description: "Ink on white, hairlines and soft depth. Calm and dense, for tools people use all day.",
  personality: { energy: 0.2, warmth: 0.3, novelty: 0.2 },
  texture: "minimal",
  color: {
    brand: "oklch(0.21 0.006 265)",
    neutral: "cool",
    modes: "both",
    defaultMode: "light",
  },
  type: {
    sans: {
      family: "Geist Variable",
      fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
      weights: [400, 500, 600],
      package: "@fontsource-variable/geist",
      license: "OFL-1.1",
    },
    mono: {
      family: "Geist Mono Variable",
      fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      weights: [400, 500],
      package: "@fontsource-variable/geist-mono",
      license: "OFL-1.1",
    },
    baseSize: 14,
    ratio: 1.2,
  },
  shape: { radius: 8 },
  density: "compact",
  motion: "subtle",
  surfaces: ["web-app", "marketing", "code", "chat"],
  voice: {
    uiCase: "sentence",
    emoji: "never",
    tone: "Plain and exact. Lead with the result, then the next step. No exclamation marks.",
  },
});
