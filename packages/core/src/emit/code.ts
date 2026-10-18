import { contrast, ensureContrast, inGamut, toHex, type Oklch } from "../color.js";
import type { DesignSystem, Mode } from "../system.js";
import { TEXT_MIN } from "../system.js";

/**
 * Syntax highlighting themes in the TextMate format Shiki reads. Color is
 * used sparingly: keywords take the brand, strings and numbers get one hue
 * each, functions stay in the text color. Every token color is raised to
 * 4.5:1 against the code background (the muted role), in both modes.
 */

export type SyntaxRole = "keyword" | "string" | "number" | "type" | "function" | "property" | "comment" | "punctuation";

export interface CodeTheme {
  name: string;
  type: Mode;
  colors: Record<string, string>;
  tokenColors: { scope: string[]; settings: { foreground?: string; fontStyle?: string } }[];
}

export function syntaxColors(s: DesignSystem, mode: Mode): { background: Oklch; foreground: Oklch; tokens: Record<SyntaxRole, Oklch> } {
  const r = s.roles[mode];
  const bg = r.muted;
  const light = mode === "light";
  const hue = (h: number, c = 0.13): Oklch => inGamut({ l: light ? 0.5 : 0.8, c, h });
  const raw: Record<SyntaxRole, Oklch> = {
    keyword: r.primary,
    string: hue(150, 0.12),
    number: hue(60, 0.13),
    type: hue((s.brand.seed.h + 50) % 360, 0.11),
    function: r.foreground,
    property: r.foreground,
    comment: r["muted-foreground"],
    punctuation: r["muted-foreground"],
  };
  const tokens = {} as Record<SyntaxRole, Oklch>;
  for (const [role, color] of Object.entries(raw) as [SyntaxRole, Oklch][]) {
    tokens[role] = ensureContrast(color, bg, TEXT_MIN) ?? r.foreground;
  }
  return { background: bg, foreground: r.foreground, tokens };
}

export function codeTheme(s: DesignSystem, mode: Mode): CodeTheme {
  const { background, foreground, tokens: t } = syntaxColors(s, mode);
  const hex = (c: Oklch) => toHex(c);
  return {
    name: `${s.config.name}-${mode}`,
    type: mode,
    colors: { "editor.background": hex(background), "editor.foreground": hex(foreground) },
    tokenColors: [
      { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: hex(t.comment), fontStyle: "italic" } },
      {
        scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "keyword.operator.new", "keyword.operator.expression", "entity.name.tag", "support.class.component"],
        settings: { foreground: hex(t.keyword) },
      },
      { scope: ["string", "string.quoted", "string.template", "punctuation.definition.string", "markup.inline.raw"], settings: { foreground: hex(t.string) } },
      { scope: ["constant.numeric", "constant.language", "constant.character", "support.constant", "variable.other.constant"], settings: { foreground: hex(t.number) } },
      { scope: ["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.other.inherited-class"], settings: { foreground: hex(t.type) } },
      { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: hex(t.function) } },
      { scope: ["variable.parameter", "variable.other.property", "meta.object-literal.key", "entity.other.attribute-name", "support.type.property-name"], settings: { foreground: hex(t.property) } },
      { scope: ["punctuation", "meta.brace", "keyword.operator", "punctuation.separator", "punctuation.terminator"], settings: { foreground: hex(t.punctuation) } },
    ],
  };
}

/** Lowest contrast of any token color against the code background, per mode. */
export function codeContrast(s: DesignSystem): Record<Mode, number> {
  const out = {} as Record<Mode, number>;
  for (const mode of ["light", "dark"] as const) {
    const { background, tokens } = syntaxColors(s, mode);
    out[mode] = Math.min(...Object.values(tokens).map((c) => contrast(c, background)));
  }
  return out;
}

export function emitCodeThemes(s: DesignSystem): Record<string, string> {
  if (!s.config.surfaces.includes("code")) return {};
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  return {
    "code/code-theme-light.json": json(codeTheme(s, "light")),
    "code/code-theme-dark.json": json(codeTheme(s, "dark")),
  };
}
