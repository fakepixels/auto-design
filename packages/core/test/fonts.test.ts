import { describe, expect, it } from "vitest";
import { presets } from "../../presets/src/index.js";
import { FONT_CATALOG, FONTS, MOODS, PAIRINGS, buildSystem, customFonts, fontsFor, fontsOf, pairingFonts, pairingOf, type DesignConfig } from "../src/index.js";

const base = presets.quiet!;
const withType = (type: Partial<DesignConfig["type"]>): DesignConfig => ({ ...base, type: { ...base.type, ...type } as DesignConfig["type"] });

describe("font catalog", () => {
  it("offers well over a hundred open-source families across every style", () => {
    expect(FONT_CATALOG.length).toBeGreaterThan(150);
    expect(new Set(FONT_CATALOG.map((f) => f.style)).size).toBeGreaterThanOrEqual(12);
    for (const f of FONT_CATALOG) {
      expect(f.license, f.id).toBe("OFL-1.1");
      expect(f.package, f.id).toMatch(/^@fontsource(-variable)?\//);
      expect(f.roles.length, f.id).toBeGreaterThan(0);
      expect(f.note, f.id).toMatch(/\.$/);
    }
    expect(fontsFor("body").length).toBeGreaterThan(90);
    expect(fontsFor("mono").length).toBeGreaterThan(15);
  });

  it("has dozens of pairings in every mood, each a valid system", () => {
    expect(PAIRINGS.length).toBeGreaterThanOrEqual(45);
    expect(new Set(PAIRINGS.map((p) => p.id)).size).toBe(PAIRINGS.length);
    for (const m of MOODS) expect(PAIRINGS.filter((p) => p.mood === m.id).length, m.id).toBeGreaterThanOrEqual(5);
    for (const p of PAIRINGS) {
      expect(FONTS[p.sans.font]?.roles, p.id).toContain("body");
      expect(FONTS[p.mono.font]?.roles, p.id).toContain("mono");
      if (p.display) expect(FONTS[p.display.font]?.roles, p.id).toContain("display");
      const s = buildSystem(withType(pairingFonts(p.id)));
      expect(s.report.checks.every((c) => c.pass), p.id).toBe(true);
      expect(pairingOf(s.config), p.id).toBe(p.id);
    }
  });

  it("builds a system from any body face, and any display face over it", () => {
    for (const f of fontsFor("body")) {
      const s = buildSystem(withType(customFonts({ sans: f.id, mono: "jetbrains-mono" })));
      expect(s.type.fonts.sans.family, f.id).toBe(f.family);
    }
    for (const f of fontsFor("display")) {
      const s = buildSystem(withType(customFonts({ sans: "inter", mono: "geist-mono", display: f.id })));
      if (f.id !== "inter") expect(s.type.fonts.display?.family, f.id).toBe(f.family);
    }
  });

  it("keeps faces in their roles and reads a config back to catalog ids", () => {
    expect(() => customFonts({ sans: "bebas-neue", mono: "jetbrains-mono" })).toThrow(/display face/);
    expect(() => customFonts({ sans: "inter", mono: "inter" })).toThrow(/monospace/);
    const config = withType(customFonts({ sans: "work-sans", mono: "space-mono", display: "gloock" }));
    expect(fontsOf(config)).toEqual({ sans: "work-sans", mono: "space-mono", display: "gloock" });
    expect(pairingOf(config)).toBeNull();
  });
});
