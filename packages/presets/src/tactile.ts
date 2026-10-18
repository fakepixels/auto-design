import { defineConfig, pairingFonts } from "@auto-design/core";

/**
 * Tactile: for consumer and community products. Soft shadows, large corners,
 * a saturated accent and presses you can feel, with characterful headlines.
 */
export default defineConfig({
  name: "tactile",
  displayName: "Tactile",
  description: "Soft, bright and physical. Surfaces you want to press.",
  personality: { energy: 0.75, warmth: 0.8, novelty: 0.55 },
  texture: "tactile",
  color: {
    brand: "oklch(0.58 0.22 355)",
    neutral: "warm",
    modes: "both",
    defaultMode: "light",
  },
  type: {
    ...pairingFonts("bricolage"),
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
