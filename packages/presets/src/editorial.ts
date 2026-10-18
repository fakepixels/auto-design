import { defineConfig, pairingFonts } from "@auto-design/core";

/**
 * Editorial: for fintech, legal and premium consumer products. Warm paper,
 * a serif voice for headlines, generous space and almost no shadow. Motion
 * is limited to quiet fades.
 */
export default defineConfig({
  name: "editorial",
  displayName: "Editorial",
  description: "Calm and literate. Typography carries the design; color is used sparingly.",
  personality: { energy: 0.15, warmth: 0.6, novelty: 0.35 },
  texture: "editorial",
  color: {
    brand: "oklch(0.4 0.075 158)",
    neutral: "warm",
    modes: "both",
    defaultMode: "light",
  },
  type: {
    ...pairingFonts("instrument"),
    baseSize: 16,
    ratio: 1.25,
  },
  shape: { radius: 4 },
  density: "comfortable",
  motion: "still",
  surfaces: ["web-app", "marketing", "chat"],
  voice: {
    uiCase: "sentence",
    emoji: "never",
    tone: "Considered and plain-spoken. Short sentences, precise numbers, no hype.",
  },
});
