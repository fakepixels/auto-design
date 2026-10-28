import type { DesignConfig } from "auto-design";

/**
 * The source of truth for this design system. Change a value here, run
 * `npx auto-design build`, and every token, component and agent file updates.
 * Every field is checked: values outside the system's options fail the build.
 */
export default {
  name: "auto-design",
  displayName: "auto-design",
  description: "Turns a few taste choices into a design system repo with hard guardrails, so agents never go off-brand.",
  personality: {
    energy: 0.3,
    warmth: 0.25,
    novelty: 0.35
  },
  texture: "minimal",
  color: {
    brand: "oklch(0.97 0.003 265)",
    neutral: "cool",
    modes: "both",
    defaultMode: "dark"
  },
  type: {
    sans: {
      family: "Inter Variable",
      fallback: [
        "Inter",
        "ui-sans-serif",
        "system-ui",
        "sans-serif"
      ],
      weights: [
        400,
        500,
        600
      ],
      package: "@fontsource-variable/inter",
      license: "OFL-1.1"
    },
    mono: {
      family: "JetBrains Mono Variable",
      fallback: [
        "JetBrains Mono",
        "ui-monospace",
        "SFMono-Regular",
        "Menlo",
        "monospace"
      ],
      weights: [
        400,
        500
      ],
      package: "@fontsource-variable/jetbrains-mono",
      license: "OFL-1.1"
    },
    baseSize: 14,
    ratio: 1.2
  },
  shape: {
    radius: 12
  },
  density: "comfortable",
  motion: "subtle",
  surfaces: [
    "marketing",
    "web-app",
    "code"
  ],
  voice: {
    uiCase: "sentence",
    emoji: "never",
    tone: "Plain and exact. Lead with what you get, then the one command. No exclamation marks."
  },
  private: false
} satisfies DesignConfig;
