import { describe, expect, it } from "vitest";
import quiet from "../../presets/src/quiet.js";
import {
  ConfigError,
  buildSystem,
  contrast,
  emitAll,
  emitCss,
  parseColor,
  type DesignConfig,
} from "../src/index.js";

const withBrand = (brand: string): DesignConfig => ({ ...quiet, color: { ...quiet.color, brand } });

describe("buildSystem", () => {
  it("builds the Quiet preset with every contrast check passing", () => {
    const s = buildSystem(quiet);
    expect(s.report.checks.length).toBeGreaterThan(20);
    expect(s.report.checks.every((c) => c.pass)).toBe(true);
  });

  it("keeps the exact brand color as primary in light mode", () => {
    const s = buildSystem(quiet);
    const seed = parseColor(quiet.color.brand);
    expect(contrast(s.roles.light.primary, seed)).toBeCloseTo(1, 2);
  });

  it("puts dark text on a light brand instead of changing the brand", () => {
    const s = buildSystem(withBrand("#facc15"));
    const { primary, "primary-foreground": label } = s.roles.light;
    expect(label.l).toBeLessThan(0.3);
    expect(contrast(primary, label)).toBeGreaterThanOrEqual(4.5);
  });

  it("lightens a very dark brand in dark mode so buttons stay visible", () => {
    const s = buildSystem(withBrand("#0b1f4d"));
    expect(contrast(s.roles.dark.primary, s.roles.dark.background)).toBeGreaterThanOrEqual(3);
    expect(s.report.notes.some((n) => n.startsWith("dark: primary uses brand-"))).toBe(true);
  });

  it("reaches AA contrast for any brand hue", () => {
    for (const brand of ["#ff0000", "#00ff00", "#0000ff", "#ff00ff", "#00ffff", "#888888", "#ffffff", "#000000", "oklch(0.7 0.2 140)"]) {
      const s = buildSystem(withBrand(brand));
      expect(s.report.checks.filter((c) => !c.pass)).toEqual([]);
    }
  });

  it("builds for every brand color across the visible range", () => {
    const failures: string[] = [];
    for (let l = 0.05; l <= 0.96; l += 0.05) {
      for (let h = 0; h < 360; h += 24) {
        for (const c of [0, 0.04, 0.08, 0.12, 0.18, 0.26]) {
          const brand = `oklch(${l.toFixed(2)} ${c} ${h})`;
          try {
            const s = buildSystem(withBrand(brand));
            if (s.report.checks.some((x) => !x.pass)) failures.push(brand);
          } catch {
            failures.push(brand);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("shifts a mid-tone brand just enough to carry a label", () => {
    const s = buildSystem(withBrand("oklch(0.58 0.106 17.6)"));
    expect(contrast(s.roles.light.primary, s.roles.light["primary-foreground"])).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(s.roles.light.primary.l - 0.58)).toBeLessThan(0.08);
    expect(s.roles.light.ring).toEqual(s.roles.light.primary);
  });

  it("never emits text smaller than 12px", () => {
    const s = buildSystem({ ...quiet, type: { ...quiet.type, baseSize: 14, ratio: 1.333 } });
    expect(s.type.scale.xs.px).toBeGreaterThanOrEqual(12);
    const sizes = Object.values(s.type.scale).map((v) => v.px);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });

  it("rejects commercial fonts in a public system", () => {
    const bad: DesignConfig = { ...quiet, type: { ...quiet.type, sans: { ...quiet.type.sans, license: "commercial" } } };
    expect(() => buildSystem(bad)).toThrow(ConfigError);
    expect(() => buildSystem({ ...bad, private: true })).not.toThrow();
  });

  it("rejects free-form values the schema does not offer", () => {
    expect(() => buildSystem({ ...quiet, texture: "brutalist" as never })).toThrow(ConfigError);
    expect(() => buildSystem(withBrand("not-a-color"))).toThrow();
  });
});

describe("emit", () => {
  it("locks Tailwind's default namespaces", () => {
    const css = emitCss(buildSystem(quiet));
    for (const ns of ["--color-*: initial", "--font-*: initial", "--shadow-*: initial", "--ease-*: initial"]) {
      expect(css).toContain(ns);
    }
    expect(css).not.toMatch(/--font-weight-bold/);
    expect(css).toContain("--font-weight-semibold: 600");
  });

  it("emits every file a system repo needs", () => {
    const files = emitAll(buildSystem(quiet));
    for (const path of [
      "css/auto-design.css",
      "DESIGN.md",
      "tokens/base.tokens.json",
      "tokens/light.tokens.json",
      "tokens/dark.tokens.json",
      "rules/guardrails.json",
      "registry.json",
      "public/r/base.json",
      "public/r/button.json",
    ]) {
      expect(files[path], path).toBeTruthy();
    }
    const base = JSON.parse(files["public/r/base.json"]!);
    expect(base.type).toBe("registry:base");
    const cssFile = base.files.find((f: { target: string }) => f.target === "app/auto-design.css");
    expect(cssFile.content).toContain("--color-*: initial");
    expect(cssFile.content).toMatch(/:root:root \{[^}]*--primary: oklch\(/);
    expect(base.css).toEqual({ '@import "./auto-design.css"': {} });
    expect(base.cssVars).toBeUndefined();
    const light = JSON.parse(files["tokens/light.tokens.json"]!);
    expect(light.role.foreground.$value).toBe("{color.neutral.950}");
  });
});

describe("dark mode primary", () => {
  it("reads as text on every dark surface", () => {
    const s = buildSystem(quiet);
    for (const surface of ["background", "card", "muted"] as const) {
      expect(contrast(s.roles.dark.primary, s.roles.dark[surface])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("code theme", () => {
  it("keeps every syntax color readable on the code background, for any brand", async () => {
    const { codeContrast } = await import("../src/index.js");
    for (const brand of ["#facc15", "#0b1f4d", "#e11d48", "#0f766e", "#888888", "oklch(0.58 0.106 17.6)"]) {
      const c = codeContrast(buildSystem(withBrand(brand)));
      expect(c.light, brand).toBeGreaterThanOrEqual(4.5);
      expect(c.dark, brand).toBeGreaterThanOrEqual(4.5);
    }
  });
});
