import type { DesignConfig } from "auto-design";

/**
 * The source of truth for this design system. Change a value here, run
 * `npx auto-design build`, and every token, component and agent file updates.
 * Every field is checked: values outside the system's options fail the build.
 */
export default {
  name: "quiet",
  displayName: "Quiet",
  description: "Calm, dense and precise. Built for dashboards and tools people use all day.",
  personality: {
    energy: 0.2,
    warmth: 0.3,
    novelty: 0.2
  },
  texture: "minimal",
  color: {
    brand: "oklch(0.49 0.13 256)",
    neutral: "cool",
    modes: "both",
    defaultMode: "light"
  },
  type: {
    sans: {
      family: "Geist Variable",
      fallback: [
        "ui-sans-serif",
        "system-ui",
        "sans-serif"
      ],
      weights: [
        400,
        500,
        600
      ],
      package: "@fontsource-variable/geist",
      license: "OFL-1.1"
    },
    mono: {
      family: "Geist Mono Variable",
      fallback: [
        "ui-monospace",
        "SFMono-Regular",
        "Menlo",
        "monospace"
      ],
      weights: [
        400,
        500
      ],
      package: "@fontsource-variable/geist-mono",
      license: "OFL-1.1"
    },
    baseSize: 14,
    ratio: 1.2
  },
  shape: {
    radius: 6
  },
  density: "compact",
  motion: "subtle",
  surfaces: [
    "web-app",
    "marketing",
    "code",
    "chat"
  ],
  voice: {
    uiCase: "sentence",
    emoji: "never",
    tone: "Plain and exact. Lead with the result, then the next step. No exclamation marks."
  }
} satisfies DesignConfig;
