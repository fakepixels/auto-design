import { describe, expect, it } from "vitest";
import { buildGuardrails, buildSystem, componentSources } from "../../core/src/index.js";
import { presets } from "../../presets/src/index.js";
import { checkSource, isTitleCase } from "../src/index.js";

const g = buildGuardrails(buildSystem(presets.quiet!));
const rulesIn = (src: string, file = "x.tsx") => checkSource(src, file, g).violations.map((v) => v.rule);

describe("class rules", () => {
  it("flags palette colors, raw colors and arbitrary values", () => {
    const src = `export const A = () => <div className="bg-blue-500 text-white p-[13px] text-[#333] hover:bg-red-600/50" />;`;
    expect(rulesIn(src)).toEqual(["no-palette-color", "no-palette-color", "no-arbitrary-value", "no-raw-color", "no-palette-color"]);
  });

  it("allows roles, opacity modifiers, variants and layout arbitraries", () => {
    const src = `export const A = () => <div className="bg-primary/10 text-muted-foreground md:p-4 hover:bg-accent grid-cols-[200px_1fr] w-[calc(100%-2rem)] [&_svg]:size-4 dark:border-input" />;`;
    expect(rulesIn(src)).toEqual([]);
  });

  it("enforces the type, weight, spacing, radius, shadow and motion scales", () => {
    const src = `export const A = () => <p className="text-7xl font-bold font-serif p-7 rounded-3xl shadow-2xl duration-500 ease-in scale-0" />;`;
    expect(rulesIn(src)).toEqual([
      "type-scale",
      "font-weight",
      "font-family",
      "spacing-scale",
      "radius-scale",
      "shadow-scale",
      "motion-duration",
      "motion-easing",
      "no-scale-zero",
    ]);
  });

  it("reads classes inside cn(), cva() and classNames objects", () => {
    const src = `
      const v = cva("p-4 bg-gray-100", { variants: { size: { sm: "h-8 px-7" } } });
      const t = { classNames: { toast: "text-black" } };
      export const A = () => <div className={cn("gap-2", ok && "m-9")} />;`;
    expect(rulesIn(src)).toEqual(["no-palette-color", "spacing-scale", "no-palette-color", "spacing-scale"]);
  });

  it("ignores class-like words in ordinary strings", () => {
    expect(rulesIn(`const sku = "p-13 bg-blue-500"; const label = "Part p-7";`)).toEqual([]);
  });

  it("flags gradient text", () => {
    expect(rulesIn(`const A = () => <h1 className="bg-clip-text text-transparent" />;`)).toEqual(["no-gradient-text"]);
  });
});

describe("raw colors outside classes", () => {
  it("flags hex constants, style objects and SVG attributes", () => {
    const src = `
      const COLORS = ["#8884d8", "rgb(1 2 3)"];
      export const A = () => (
        <svg fill="#ff0000" stroke="currentColor"><circle style={{ color: "red", backgroundColor: "var(--card)" }} /></svg>
      );`;
    expect(rulesIn(src)).toEqual(["no-raw-color", "no-raw-color", "no-raw-color", "no-raw-color"]);
  });

  it("does not mistake anchors for hex colors", () => {
    expect(rulesIn(`const A = () => <a href="#add">Add</a>;`)).toEqual([]);
  });
});

describe("motion in JS", () => {
  it("flags scale 0 and long durations in motion props", () => {
    const src = `const A = () => <motion.div initial={{ scale: 0, opacity: 0 }} transition={{ duration: 0.8 }} />;`;
    expect(rulesIn(src)).toEqual(["no-scale-zero", "motion-duration"]);
  });
});

describe("voice", () => {
  it("detects Title Case labels", () => {
    expect(isTitleCase("Create New Project")).toBe(true);
    expect(isTitleCase("Create new project")).toBe(false);
    expect(isTitleCase("Save")).toBe(false);
    expect(isTitleCase("Terms of Service")).toBe(true);
  });

  it("warns on Title Case buttons and emoji", () => {
    const src = `const A = () => <><Button>Create New Project</Button><p>Shipped 🚀</p></>;`;
    const v = checkSource(src, "x.tsx", g).violations;
    expect(v.map((x) => [x.rule, x.severity])).toEqual([
      ["ui-case", "warn"],
      ["no-emoji", "warn"],
    ]);
  });
});

describe("escape hatch", () => {
  it("suppresses a rule on the next line and records why", () => {
    const src = `
      // auto-design-allow no-arbitrary-value: partner logo has a fixed height
      const A = () => <img className="h-8 p-[3px]" />;`;
    const r = checkSource(src, "x.tsx", g);
    expect(r.violations).toEqual([]);
    expect(r.allowances).toEqual([{ file: "x.tsx", line: 2, rules: ["no-arbitrary-value"], reason: "partner logo has a fixed height" }]);
  });

  it("does not suppress other rules", () => {
    const src = `
      // auto-design-allow no-arbitrary-value: reason
      const A = () => <img className="bg-blue-500" />;`;
    expect(checkSource(src, "x.tsx", g).violations.map((v) => v.rule)).toEqual(["no-palette-color"]);
  });
});

describe("css", () => {
  it("flags app CSS that redefines system tokens", () => {
    const css = `
      @theme inline { --color-background: var(--background); --font-sans: var(--font-geist-sans); --my-thing: 1px; }
      :root { --primary: oklch(0.5 0.1 250); --background: #fff; --brand-hero: 4rem; }`;
    expect(rulesIn(css, "x.css")).toEqual(["no-token-override", "no-token-override", "no-token-override", "no-token-override"]);
  });

  it("flags literals in declarations but not new token definitions", () => {
    const css = `
      @theme { --spacing-gutter: 24px; }
      :root { --hero-height: 40rem; }
      .a { color: #333; font-size: 15px; font-family: Arial; transition: opacity 500ms; transform: scale(0); }
      .b { color: var(--foreground); transition: opacity var(--duration-fast); }
      .c { @apply bg-blue-500 p-4; }`;
    expect(rulesIn(css, "x.css")).toEqual([
      "no-raw-color",
      "type-scale",
      "font-family",
      "motion-duration",
      "no-scale-zero",
      "no-palette-color",
    ]);
  });
});

describe("generated components", () => {
  it("pass the check for every preset", () => {
    for (const [name, preset] of Object.entries(presets)) {
      const s = buildSystem(preset);
      const guard = buildGuardrails(s);
      for (const c of componentSources(s)) {
        const v = checkSource(c.content, c.file, guard).violations;
        expect(v, `${name}/${c.file}: ${JSON.stringify(v)}`).toEqual([]);
      }
    }
  });
});

describe("texture rules", () => {
  const glass = buildGuardrails(buildSystem(presets.glass!));
  const editorial = buildGuardrails(buildSystem(presets.editorial!));

  it("warns when glass sits on content", () => {
    const src = `const A = () => <><nav className="glass" /><table className="glass" /><Card className="glass p-4" /></>;`;
    const v = checkSource(src, "x.tsx", glass).violations;
    expect(v.map((x) => [x.rule, x.severity])).toEqual([
      ["glass-on-content", "warn"],
      ["glass-on-content", "warn"],
    ]);
  });

  it("warns when the display font is used small", () => {
    const src = `const A = () => <><h1 className="font-display text-5xl" /><p className="font-display text-sm" /></>;`;
    expect(checkSource(src, "x.tsx", editorial).violations.map((x) => x.rule)).toEqual(["display-size"]);
  });
});
