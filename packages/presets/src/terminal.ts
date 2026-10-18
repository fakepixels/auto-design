import { defineConfig, pairingFonts } from "@auto-design/core";

/**
 * Terminal: for developer tools and infrastructure. Dark first, crisp 1px
 * borders, monospace for labels and data, and motion that gets out of the way.
 */
export default defineConfig({
  name: "terminal",
  displayName: "Terminal",
  description: "Dark, dense and exact. Monospace for anything a developer reads or copies.",
  personality: { energy: 0.35, warmth: 0.15, novelty: 0.45 },
  texture: "technical",
  color: {
    brand: "oklch(0.8 0.16 130)",
    neutral: "neutral",
    modes: "both",
    defaultMode: "dark",
  },
  type: {
    ...pairingFonts("plex"),
    baseSize: 14,
    ratio: 1.2,
  },
  shape: { radius: 2 },
  density: "compact",
  motion: "subtle",
  surfaces: ["web-app", "marketing", "code", "chat", "mcp-apps"],
  voice: {
    uiCase: "sentence",
    emoji: "never",
    tone: "Terse and technical. Name the command, the flag or the error. No filler.",
  },
});
