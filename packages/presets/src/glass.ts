import { defineConfig, pairingFonts } from "@auto-design/core";

/**
 * Glass: for consumer, mobile-first and agent-companion products. Frosted
 * chrome (nav, sheets, dialogs, popovers) over a soft tinted backdrop, with
 * content on solid surfaces so text and numbers stay crisp.
 */
export default defineConfig({
  name: "glass",
  displayName: "Glass",
  description: "Light and luminous. Frosted chrome over solid content, with motion that feels physical.",
  personality: { energy: 0.6, warmth: 0.55, novelty: 0.6 },
  texture: "glass",
  color: {
    brand: "oklch(0.55 0.18 245)",
    neutral: "cool",
    modes: "both",
    defaultMode: "light",
  },
  type: {
    ...pairingFonts("figtree"),
    baseSize: 16,
    ratio: 1.2,
  },
  shape: { radius: 14 },
  density: "comfortable",
  motion: "expressive",
  surfaces: ["web-app", "marketing", "chat", "messaging"],
  voice: {
    uiCase: "sentence",
    emoji: "sparingly",
    tone: "Warm and brief. Talk like a helpful friend, not a form.",
  },
});
