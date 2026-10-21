import { defineConfig, pairingFonts } from "@auto-design/core";

/**
 * Tactile: for consumer and community products. Raised buttons with a lit top
 * edge that press down, soft cards, round corners, a warm tangerine accent
 * with dark labels, and a friendly, rounded face.
 */
export default defineConfig({
  name: "tactile",
  displayName: "Tactile",
  description: "Raised buttons that press down, soft cards and a warm accent. Surfaces you want to touch.",
  personality: { energy: 0.75, warmth: 0.8, novelty: 0.55 },
  texture: "tactile",
  color: {
    brand: "oklch(0.72 0.16 58)",
    neutral: "warm",
    modes: "both",
    defaultMode: "light",
  },
  type: {
    ...pairingFonts("figtree"),
    baseSize: 16,
    ratio: 1.25,
  },
  shape: { radius: 16 },
  density: "comfortable",
  motion: "expressive",
  surfaces: ["web-app", "marketing", "chat", "messaging"],
  voice: {
    uiCase: "sentence",
    emoji: "sparingly",
    tone: "Upbeat and human. Celebrate progress, keep errors kind and specific.",
  },
});
