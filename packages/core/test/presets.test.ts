import { compile } from "@tailwindcss/node";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { presets } from "../../presets/src/index.js";
import {
  FONTS,
  PAIRINGS,
  buildGuardrails,
  buildSystem,
  componentSources,
  contrast,
  emitCss,
  emitDesignMd,
  findFont,
  pairingFonts,
  pairingOf,
  type DesignConfig,
} from "../src/index.js";
import { checkSource } from "../../check/src/index.js";

const require = createRequire(import.meta.url);
const tailwindDir = dirname(require.resolve("tailwindcss/package.json"));

/** Compile a system's CSS with real Tailwind and report which candidate classes exist. */
async function compiles(css: string, candidates: string[]) {
  const compiler = await compile(`@import "tailwindcss";\n${css}`, { base: tailwindDir, onDependency() {} });
  const out = compiler.build(candidates);
  const has = (c: string) => out.includes(`.${c.replace(/[:/.\[\]]/g, (m) => `\\${m}`)} {`) || out.includes(`.${c.replace(/[:/.\[\]]/g, (m) => `\\${m}`)}{`);
  return { out, has };
}

describe("presets", () => {
  it("ships five distinct presets", () => {
    expect(Object.keys(presets)).toEqual(["quiet", "editorial", "glass", "terminal", "tactile"]);
    const textures = new Set(Object.values(presets).map((p) => p.texture));
    expect(textures.size).toBe(5);
    const brands = new Set(Object.values(presets).map((p) => p.color.brand));
    expect(brands.size).toBe(5);
  });

  for (const [name, preset] of Object.entries(presets)) {
    describe(name, () => {
      const s = buildSystem(preset);

      it("passes every contrast check", () => {
        expect(s.report.checks.filter((c) => !c.pass)).toEqual([]);
      });

      it("uses only open-license fonts from npm", () => {
        for (const f of [s.type.fonts.sans, s.type.fonts.mono, s.type.fonts.display]) {
          if (!f) continue;
          expect(f.license).toBe("OFL-1.1");
          expect(f.package).toMatch(/^@fontsource(-variable)?\//);
        }
      });

      it("generates components that pass its own guardrails", () => {
        const g = buildGuardrails(s);
        for (const c of componentSources(s)) {
          expect(checkSource(c.content, c.file, g).violations, c.file).toEqual([]);
        }
      });

      it("compiles with Tailwind: system classes exist, defaults are gone", async () => {
        const { has } = await compiles(emitCss(s), [
          "bg-primary",
          "text-muted-foreground",
          "font-sans",
          "shadow-lg",
          "rounded-lg",
          "animate-enter",
          "bg-blue-500",
          "text-white",
          "shadow-2xl",
          "font-serif",
        ]);
        for (const c of ["bg-primary", "text-muted-foreground", "font-sans", "shadow-lg", "rounded-lg", "animate-enter"]) {
          expect(has(c), c).toBe(true);
        }
        for (const c of ["bg-blue-500", "text-white", "shadow-2xl", "font-serif"]) expect(has(c), c).toBe(false);
      });
    });
  }
});

describe("dark-first systems", () => {
  const s = buildSystem(presets.terminal!);
  const css = emitCss(s);

  it("loads dark values on :root and makes light the opt-in class", () => {
    const root = css.slice(css.indexOf(":root:root {"), css.indexOf("}", css.indexOf(":root:root {")));
    const darkBg = /--background: (oklch\([^)]+\))/.exec(root)![1];
    expect(contrast(s.roles.dark.background, { l: 0, c: 0, h: 0 })).toBeLessThan(1.5);
    expect(darkBg).toMatch(/^oklch\(0\.1/);
    expect(css).toContain(":root.light {");
    expect(css).not.toContain(":root.dark {");
    expect(css).toContain("@custom-variant dark (&:where(:root:not(.light), :root:not(.light) *));");
    expect(css).toContain("color-scheme: dark;");
  });

  it("applies dark: utilities by default", async () => {
    const { out } = await compiles(css, ["dark:bg-card"]);
    expect(out).toMatch(/:root:not\(\.light\)/);
  });

  it("tells agents how light mode works", () => {
    expect(emitDesignMd(s)).toContain('<html class="light">');
  });
});

describe("glass texture", () => {
  const s = buildSystem(presets.glass!);
  const css = emitCss(s);

  it("compiles the glass utility with a solid fallback and a frosted layer", async () => {
    const { out, has } = await compiles(css, ["glass", "bg-backdrop"]);
    expect(has("glass")).toBe(true);
    expect(has("bg-backdrop")).toBe(true);
    expect(out).toMatch(/@supports \(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)/);
    expect(out).toContain("-webkit-backdrop-filter: blur(20px) saturate(1.6)");
  });

  it("puts dialogs on glass and keeps cards solid", () => {
    const dialog = componentSources(s).find((c) => c.name === "dialog")!.content;
    const card = componentSources(s).find((c) => c.name === "card")!.content;
    expect(dialog).toMatch(/rounded-lg glass p-6/);
    expect(card).not.toContain("glass");
  });

  it("is absent from other textures", () => {
    expect(emitCss(buildSystem(presets.quiet!))).not.toContain("@utility glass");
  });
});

describe("font catalog", () => {
  it("builds a valid system for every pairing", () => {
    for (const p of PAIRINGS) {
      const config: DesignConfig = { ...presets.quiet!, type: { ...presets.quiet!.type, ...pairingFonts(p.id) } };
      const s = buildSystem(config);
      expect(pairingOf(config)).toBe(p.id);
      expect(s.type.weights.length).toBeGreaterThan(0);
    }
  });

  it("keeps the Google Fonts name in the stack so previews match", () => {
    const f = pairingFonts("figtree");
    expect(f.sans.family).toBe("Figtree Variable");
    expect(f.sans.fallback?.[0]).toBe("Figtree");
  });

  it("finds catalog fonts by the names sites use", () => {
    expect(findFont("Geist")?.id).toBe("geist");
    expect(findFont("'JetBrains Mono'")?.id).toBe("jetbrains-mono");
    expect(findFont("Instrument Serif Variable")?.id).toBe("instrument-serif");
    expect(findFont("Comic Sans MS")).toBeNull();
  });

  it("only lists weights the files cover", () => {
    for (const p of PAIRINGS) {
      for (const slot of [p.sans, p.mono, p.display]) {
        if (!slot) continue;
        for (const w of slot.weights) expect(FONTS[slot.font]!.available, `${p.id} ${slot.font} ${w}`).toContain(w);
      }
    }
  });
});
