import { describe, expect, it } from "vitest";
import quiet from "../../presets/src/quiet.js";
import {
  ConfigError,
  buildSystem,
  contrast,
  emitAll,
  emitCss,
  emitDesignMd,
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

  it("builds dark-first systems for every brand color and every texture", () => {
    const failures: string[] = [];
    for (const texture of ["minimal", "editorial", "glass", "tactile", "technical"] as const) {
      for (let l = 0.1; l <= 0.96; l += 0.1) {
        for (let h = 0; h < 360; h += 45) {
          for (const c of [0, 0.08, 0.18]) {
            const brand = `oklch(${l.toFixed(2)} ${c} ${h})`;
            const config: DesignConfig = { ...withBrand(brand), texture, color: { ...withBrand(brand).color, modes: "both", defaultMode: "dark" } };
            try {
              const s = buildSystem(config);
              if (s.report.checks.some((x) => !x.pass)) failures.push(`${texture} ${brand}`);
            } catch {
              failures.push(`${texture} ${brand}`);
            }
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

describe("a product's own look", () => {
  const paper: DesignConfig = { ...quiet, color: { ...quiet.color, brand: "#3f5a36", page: "#efe6d3" } };

  it("keeps the page color exactly, and tints every surface and gray to match it", () => {
    const s = buildSystem(paper);
    const page = parseColor("#efe6d3");
    const L = s.roles.light;
    expect(L.background.l).toBeCloseTo(page.l, 3);
    expect(L.background.c).toBeCloseTo(page.c, 3);
    // Panels and borders are darker steps of the same paper, not gray from somewhere else.
    for (const role of ["muted", "secondary", "border", "input", "sidebar"] as const) {
      expect(L[role].l, role).toBeLessThan(page.l);
      expect(Math.abs(L[role].h - page.h), role).toBeLessThan(6);
      expect(L[role].c, role).toBeGreaterThan(0.015);
    }
    expect(Math.abs(s.palettes.neutral[500].h - page.h)).toBeLessThan(6);
    // Dark mode has no page of its own here, so it keeps its usual near-black.
    expect(s.roles.dark.background.l).toBeLessThan(0.2);
    expect(s.report.checks.filter((c) => !c.pass)).toEqual([]);
  });

  it("builds on any light or dark ground, for every texture", () => {
    for (const page of ["#efe6d3", "#fbf7ee", "#e8eef7", "#f4e9f2", "ivory", "#000000", "#101a2c", "#221a14"]) {
      for (const texture of ["minimal", "editorial", "glass", "tactile", "technical"] as const) {
        for (const brand of ["#3f5a36", "#0f62fe", "#111111", "#f2c94c"]) {
          const s = buildSystem({ ...quiet, texture, color: { ...quiet.color, brand, page } });
          expect(s.report.checks.filter((c) => !c.pass), `${page} ${texture} ${brand}`).toEqual([]);
          const mode = parseColor(page).l >= 0.6 ? "light" : "dark";
          expect(s.roles[mode].background.l).toBeCloseTo(parseColor(page).l, 2);
        }
      }
    }
  });

  it("changes nothing for a system without a page color", () => {
    const { page: _page, ...color } = paper.color;
    const plain = buildSystem({ ...quiet, color: { ...color, brand: quiet.color.brand } });
    expect(emitCss(plain)).toBe(emitCss(buildSystem(quiet)));
    expect(emitCss(plain)).not.toContain("font-weight: var(--font-weight");
  });

  it("allows body text up to 22px and puts 48px controls behind spacious", () => {
    const s = buildSystem({ ...paper, density: "spacious", type: { ...paper.type, baseSize: 20 } });
    expect(s.type.scale.base.px).toBe(20);
    expect(s.controls).toEqual({ sm: 10, md: 12, lg: 14 });
    expect(() => buildSystem({ ...paper, type: { ...paper.type, baseSize: 23 } })).toThrow(ConfigError);
  });

  it("sets headlines in the product's own weight, and leaves letter-spacing alone when asked", () => {
    const s = buildSystem({ ...paper, type: { ...paper.type, headingWeight: 400, tracking: "normal" } });
    expect(emitCss(s)).toMatch(/h1, h2, h3 \{\n\s+font-weight: var\(--font-weight-normal\);/);
    for (const step of Object.values(s.type.scale)) expect(step.letterSpacing.startsWith("-")).toBe(false);
    const md = emitDesignMd(s);
    expect(md).toContain("Headlines are `font-normal` (400)");
    expect(md).toContain("#efe6d3");
    expect(md).toContain("never the one below");
    // A weight the headline face doesn't carry is refused with what to do about it.
    expect(() => buildSystem({ ...paper, type: { ...paper.type, headingWeight: 300 } })).toThrow(/Add 300 to its weights/);
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
