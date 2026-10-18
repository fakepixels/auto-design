import type { Finding, GuardrailsLike } from "./types.js";

/**
 * Tailwind class analysis. Each class is reduced to its utility (variants,
 * important markers and negative signs stripped) and tested against the
 * system's scales. Everything here is deterministic: no model involved.
 */

const PALETTE =
  "slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_UTIL =
  "bg|text|border|border-[xytrblse]|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent|shadow|inset-shadow|drop-shadow";
const PALETTE_RE = new RegExp(`^(?:${COLOR_UTIL})-(?:(?:${PALETTE})(?:-\\d{2,3})?|white|black)$`);

const SPACING_RE = /^(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])-(\d+(?:\.\d+)?)$/;
const TEXT_SIZE_RE = /^text-(xs|sm|base|lg|xl|\d+xl)$/;
const WEIGHTS = ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"];
const FONT_RE = /^font-([a-z]+)$/;
const RADIUS_RE = /^rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?-(none|xs|sm|md|lg|xl|\dxl|full)$/;
const SHADOW_RE = /^shadow-(2xs|xs|sm|md|lg|xl|2xl|none|inner)$/;
const DURATION_RE = /^duration-(\d+)$/;
const EASE_RE = /^ease-([a-z-]+)$/;
const SCALE_ZERO_RE = /^scale(?:-[xy])?-0$/;

/** Prefixes whose arbitrary values bypass a token scale. Layout utilities stay free. */
const GOVERNED_ARBITRARY = new RegExp(
  `^(?:${COLOR_UTIL}|p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|font|tracking|leading|rounded(?:-[a-z]{1,2})?|duration|ease|delay|animate|blur|backdrop-blur|opacity)$`,
);

const HEX_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/i;
const COLOR_FN_RE = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/i;

export function containsRawColor(value: string): boolean {
  return HEX_RE.test(value) || COLOR_FN_RE.test(value);
}

/** Split a class into variants and utility, respecting brackets and parentheses. */
export function utilityOf(cls: string): string {
  let depth = 0;
  let last = 0;
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i];
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    else if (ch === ":" && depth === 0) last = i + 1;
  }
  let u = cls.slice(last);
  u = u.replace(/^!/, "").replace(/!$/, "").replace(/^-/, "");
  return u;
}

/** Drop a trailing opacity modifier like /50 or /[0.3] when it sits outside brackets. */
function withoutModifier(u: string): string {
  const m = /^(.*?)(\/(?:\d+|\[[^\]]+\]|\([^)]+\)))$/.exec(u);
  return m && !m[1]!.endsWith("[") ? m[1]! : u;
}

export function analyzeClass(cls: string, g: GuardrailsLike): Finding[] {
  const out: Finding[] = [];
  const raw = utilityOf(cls);
  if (!raw) return out;

  // Arbitrary properties: [mask-type:luminance]
  if (/^\[[a-z-]+:.+\]$/.test(raw)) {
    if (containsRawColor(raw)) out.push({ rule: "no-raw-color", message: `Raw color in arbitrary property "${cls}". Use a role variable.` });
    return out;
  }

  // Arbitrary values: p-[13px], text-[#333], duration-(--x)
  const arb = /^([a-z][a-z0-9-]*?)-(\[(.+)\]|\((.+)\))(\/.+)?$/.exec(raw);
  if (arb) {
    const prefix = arb[1]!;
    const inner = arb[3] ?? arb[4] ?? "";
    if (containsRawColor(inner)) {
      out.push({ rule: "no-raw-color", message: `Raw color in "${cls}". Use a role such as bg-primary or text-muted-foreground.` });
      return out;
    }
    if (GOVERNED_ARBITRARY.test(prefix)) {
      const varRef = /^(?:var\()?(--[\w-]+)\)?$/.exec(inner.replace(/^color:|^length:/, ""));
      if (varRef && g.systemVars.has(varRef[1]!)) return out;
      out.push({
        rule: "no-arbitrary-value",
        message: `"${cls}" bypasses the ${prefix.startsWith("p") || prefix.startsWith("m") || prefix.startsWith("gap") || prefix.startsWith("space") ? "spacing" : prefix} scale. Use a system step.`,
      });
    }
    return out;
  }

  const u = withoutModifier(raw);

  if (PALETTE_RE.test(u)) {
    out.push({ rule: "no-palette-color", message: `"${cls}" is a Tailwind palette color and does not exist here. Use a role (bg-primary, text-muted-foreground, border-border).` });
    return out;
  }

  const sp = SPACING_RE.exec(u);
  if (sp) {
    const n = Number(sp[1]);
    if (!g.spacing.steps.includes(n)) {
      const nearest = g.spacing.steps.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
      out.push({ rule: "spacing-scale", message: `"${cls}" is off the spacing scale. Nearest step: ${u.replace(sp[1]!, String(nearest))}.` });
    }
    return out;
  }

  const ts = TEXT_SIZE_RE.exec(u);
  if (ts) {
    if (!g.text.steps.includes(ts[1]!)) out.push({ rule: "type-scale", message: `"${cls}" is not on the type scale (${g.text.steps.join(", ")}).` });
    return out;
  }

  const f = FONT_RE.exec(u);
  if (f) {
    const name = f[1]!;
    if (WEIGHTS.includes(name)) {
      if (!(name in g.weights)) {
        out.push({ rule: "font-weight", message: `"${cls}" is not one of the system's weights (${Object.keys(g.weights).map((w) => `font-${w}`).join(", ")}).` });
      }
    } else if (!g.fonts.families.includes(name)) {
      out.push({ rule: "font-family", message: `"${cls}" is not a system font. Use ${g.fonts.families.map((x) => `font-${x}`).join(" or ")}.` });
    }
    return out;
  }

  const r = RADIUS_RE.exec(u);
  if (r) {
    if (!g.radius.steps.includes(r[1]!)) out.push({ rule: "radius-scale", message: `"${cls}" is not a radius step (${g.radius.steps.map((x) => `rounded-${x}`).join(", ")}).` });
    return out;
  }

  const sh = SHADOW_RE.exec(u);
  if (sh) {
    if (!g.shadow.steps.includes(sh[1]!)) out.push({ rule: "shadow-scale", message: `"${cls}" is not an elevation step (${g.shadow.steps.map((x) => `shadow-${x}`).join(", ")}).` });
    return out;
  }

  const d = DURATION_RE.exec(u);
  if (d) {
    const ms = Number(d[1]);
    if (!g.motion.durations.includes(ms)) {
      out.push({ rule: "motion-duration", message: `"${cls}" is not a system duration. Use ${g.motion.durations.filter((x) => x > 0).map((x) => `duration-${x}`).join(", ")}.` });
    }
    return out;
  }

  const e = EASE_RE.exec(u);
  if (e) {
    if (!g.motion.easings.includes(e[1]!)) out.push({ rule: "motion-easing", message: `"${cls}" is not a system easing. Use ${g.motion.easings.map((x) => `ease-${x}`).join(", ")}.` });
    return out;
  }

  if (SCALE_ZERO_RE.test(u)) {
    out.push({ rule: "no-scale-zero", message: `"${cls}": nothing in the real world appears from nothing. Start from the enter scale (${g.motion.enterScale}) with a fade, or use animate-enter.` });
  }
  return out;
}

/** Elements that hold content. Glass on these hurts legibility. */
const CONTENT_ELEMENTS = new Set([
  "table", "thead", "tbody", "tr", "td", "th", "p", "li", "ul", "ol", "article", "blockquote", "pre", "code",
  "Table", "TableHeader", "TableBody", "TableRow", "TableCell", "TableHead", "Card", "CardContent", "CodeBlock",
]);
const SMALL_TEXT = new Set(["text-xs", "text-sm", "text-base", "text-lg", "text-xl"]);

/** Findings that depend on several classes in the same string (and, in JSX, the element they sit on). */
export function analyzeClassList(classes: string[], element?: string): Finding[] {
  const utils = new Set(classes.map(utilityOf));
  const out: Finding[] = [];
  if (utils.has("bg-clip-text") && utils.has("text-transparent")) {
    out.push({ rule: "no-gradient-text", message: "Gradient-filled text. Use a solid role color; emphasis comes from size and weight." });
  }
  if (utils.has("glass") && element && CONTENT_ELEMENTS.has(element)) {
    out.push({ rule: "glass-on-content", message: `glass on <${element}>. Glass is for chrome (nav, dialogs, popovers); put content on a solid bg-card.` });
  }
  if (utils.has("font-display")) {
    const small = [...utils].find((u) => SMALL_TEXT.has(u));
    if (small) out.push({ rule: "display-size", message: `font-display with ${small}. The display font is for headlines at text-2xl and up; use font-sans here.` });
  }
  return out;
}

export function splitClasses(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}
