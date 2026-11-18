import { findFont, PAIRINGS, parseColor, toCss, toHex, type Oklch } from "@auto-design/core";
import type { DesignPatch } from "./patch.js";

/**
 * Read a live site for what it already looks like: its brand color and grays,
 * the page it sits on, which face sets headlines and which sets text, how big
 * and heavy they are, its corners and its buttons. This runs without a model.
 * A product that has a look keeps it: what's measured here goes into the
 * system as it is, and only what couldn't be measured falls to a default.
 */

export interface SiteColor {
  css: string;
  hex: string;
  /** How strongly the site uses it: named brand variables and theme-color count most. */
  score: number;
}

export interface SiteMaterial {
  url: string;
  title: string;
  description: string;
  themeColor: string | null;
  colors: SiteColor[];
  neutral: "cool" | "neutral" | "warm" | null;
  fonts: string[];
  pairing: string | null;
  /** Catalog faces the site itself uses, when there are any. */
  catalogFonts: { sans: string; mono: string; display: string | null } | null;
  radius: number | null;
  dark: boolean;
  /** The page's own background, when it isn't plain white or black. */
  page: { css: string; hex: string } | null;
  /** How the site sets type and controls; null where it couldn't be measured. */
  measure: SiteMeasure;
  /** Where the measurements came from: the rendered page, or its CSS alone. */
  measuredFrom: "rendered" | "css";
  /** What was read, for the model and for the person. */
  summary: string;
}

/** What a page looks like, measured. Sizes are in px. */
export interface SiteMeasure {
  /** The page background as a CSS color. */
  background: string | null;
  bodyFont: string | null;
  headingFont: string | null;
  bodyKind: "sans" | "serif" | "mono" | null;
  headingKind: "sans" | "serif" | "mono" | null;
  bodySize: number | null;
  /** The main headline (h1). */
  headingSize: number | null;
  headingWeight: number | null;
  /** Headline letter-spacing in em. */
  headingTracking: number | null;
  /** Height of the main button. */
  controlHeight: number | null;
  radius: number | null;
}

export const emptyMeasure = (): SiteMeasure => ({
  background: null, bodyFont: null, headingFont: null, bodyKind: null, headingKind: null, bodySize: null,
  headingSize: null, headingWeight: null, headingTracking: null, controlHeight: null, radius: null,
});

const MAX_HTML = 1_500_000;
const MAX_CSS = 600_000;
const MAX_SHEETS = 6;

const COLOR_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^)]{3,80}\)/gi;
const BRAND_VAR_RE = /--(?:[\w-]*?(?:primary|brand|accent|main|key|cta)[\w-]*)\s*:\s*([^;}{]+)/gi;
const FONT_RE = /font-family\s*:\s*([^;}{]+)/gi;
const RADIUS_RE = /border-radius\s*:\s*(\d+(?:\.\d+)?)(px|rem)\b/gi;

async function fetchText(url: string, max: number, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; auto-design/0.1; +https://github.com/fakepixels/auto-design)", accept: "text/html,text/css,*/*" },
    redirect: "follow",
    signal: signal ?? AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
    if (size > max) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const attr = (tag: string, name: string) => new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1] ?? null;

function meta(html: string, key: string): string | null {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if ((attr(tag, "name") ?? attr(tag, "property"))?.toLowerCase() === key) return attr(tag, "content");
  }
  return null;
}

function safeColor(css: string): Oklch | null {
  try {
    const c = parseColor(css.trim());
    if (c.alpha !== undefined && c.alpha < 0.6) return null;
    return c;
  } catch {
    return null;
  }
}

const near = (a: Oklch, b: Oklch) => {
  const dh = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h)) / 360;
  return Math.abs(a.l - b.l) < 0.06 && Math.abs(a.c - b.c) < 0.05 && (a.c < 0.04 || dh < 0.04);
};

/** Rank and merge the colors in some CSS. Exported for tests. */
export function rankColors(css: string, themeColor: string | null) {
  const tally: { color: Oklch; score: number }[] = [];
  const add = (c: Oklch | null, weight: number) => {
    if (!c) return;
    const hit = tally.find((t) => near(t.color, c));
    if (hit) hit.score += weight;
    else tally.push({ color: c, score: weight });
  };
  for (const m of css.matchAll(BRAND_VAR_RE)) {
    const v = m[1]!.trim();
    const literal = v.match(COLOR_RE)?.[0];
    if (literal) add(safeColor(literal), 12);
    else if (/^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/.test(v)) add(safeColor(`hsl(${v.replace(/\s+/g, " ")})`), 12);
  }
  for (const m of css.matchAll(COLOR_RE)) add(safeColor(m[0]), 1);
  if (themeColor) add(safeColor(themeColor), 20);

  const chromatic = tally.filter((t) => t.color.c >= 0.06 && t.color.l > 0.2 && t.color.l < 0.92).sort((a, b) => b.score - a.score);
  const grays = tally.filter((t) => t.color.c > 0.003 && t.color.c < 0.04 && t.color.l > 0.15 && t.color.l < 0.97);
  let neutral: SiteMaterial["neutral"] = null;
  if (grays.length) {
    let x = 0;
    let y = 0;
    for (const g of grays) {
      x += Math.cos((g.color.h * Math.PI) / 180) * g.score;
      y += Math.sin((g.color.h * Math.PI) / 180) * g.score;
    }
    const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    neutral = hue > 180 && hue < 300 ? "cool" : hue > 20 && hue < 120 ? "warm" : "neutral";
  }
  const colors: SiteColor[] = chromatic.slice(0, 6).map((t) => ({ css: toCss(t.color), hex: toHex(t.color), score: t.score }));
  return { colors, neutral };
}

function fontsIn(css: string, html: string): string[] {
  const counts = new Map<string, number>();
  const bump = (name: string, w: number) => {
    const n = name.trim().replace(/^["']|["']$/g, "");
    if (!n || /^(?:var\(|inherit|initial|unset|-apple-system|system-ui|ui-|sans-serif|serif|monospace|blinkmacsystemfont|segoe ui|roboto|helvetica|arial)/i.test(n)) return;
    counts.set(n, (counts.get(n) ?? 0) + w);
  };
  for (const m of css.matchAll(FONT_RE)) bump(m[1]!.split(",")[0]!, 1);
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'>\s]+)/gi)) {
    for (const fam of m[1]!.matchAll(/family=([^&:]+)/g)) bump(decodeURIComponent(fam[1]!.replace(/\+/g, " ")), 6);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 5);
}

function radiusIn(css: string): number | null {
  const values: number[] = [];
  for (const m of css.matchAll(RADIUS_RE)) {
    const px = m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
    if (px >= 2 && px <= 24) values.push(px);
  }
  if (values.length < 3) return null;
  values.sort((a, b) => a - b);
  return Math.round(values[Math.floor(values.length / 2)]!);
}

/* ---------- Reading how the page is set, from its CSS ---------- */

interface Decl {
  selector: string;
  prop: string;
  value: string;
}

/**
 * Every declaration in some CSS, in source order, with the selector it belongs
 * to. Media, supports, layer and container blocks are transparent, nested ones
 * included (Tailwind 4 nests them inside the rule). Dark-mode and narrow-screen
 * blocks are skipped: the reading is of the page as a desktop visitor first sees it.
 */
export function declarations(css: string): Decl[] {
  const out: Decl[] = [];
  const stack: { prelude: string; skip: boolean }[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let buf = "";
  let depth = 0;
  const selector = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const p = stack[i]!.prelude;
      if (!p.startsWith("@")) return p;
      if (!/^@(?:media|supports|layer|container|starting-style|scope)\b/i.test(p)) return null;
    }
    return null;
  };
  const flush = () => {
    const d = buf.trim();
    buf = "";
    if (!d || !stack.length || stack.some((f) => f.skip)) return;
    const colon = d.indexOf(":");
    const sel = selector();
    if (colon < 1 || !sel) return;
    out.push({ selector: sel, prop: d.slice(0, colon).trim().toLowerCase(), value: d.slice(colon + 1).replace(/!important/i, "").trim() });
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && ch === "{") {
      const prelude = buf.trim().replace(/\s+/g, " ");
      buf = "";
      const skip =
        /prefers-color-scheme\s*:\s*dark|max-width|width\s*<|\bprint\b|prefers-reduced/i.test(prelude) ||
        (!prelude.startsWith("@") && /(?:^|[\s,.(\[])(?:dark|theme-dark)\b|data-theme\s*=\s*["']?dark|^&/i.test(prelude)) ||
        /^@(?:keyframes|font-face|property|page|counter-style)/i.test(prelude);
      stack.push({ prelude, skip });
    } else if (depth === 0 && ch === "}") {
      flush();
      stack.pop();
    } else if (depth === 0 && ch === ";") {
      flush();
    } else buf += ch;
  }
  return out;
}

interface El {
  tag: string;
  classes: Set<string>;
}

const elOf = (html: string, tag: string): El | null => {
  const m = new RegExp(`<${tag}\\b([^>]*)>`, "i").exec(html);
  if (!m) return null;
  return { tag, classes: new Set((attr(m[1]!, "class") ?? "").split(/\s+/).filter(Boolean)) };
};

/** Whether a selector's last compound is this element: its tag, some of its classes, or both. */
function matches(selector: string, el: El): boolean {
  for (const part of selector.split(",")) {
    const compounds = part.trim().replace(/:root\b/g, "html").replace(/:where\(([^()]*)\)|:is\(([^()]*)\)/g, "$1$2").split(/\s*[>+~]\s*|\s+/);
    const last = compounds.pop() ?? "";
    // Anything above <body> other than a bare <html> is a condition (a theme class, a state), not this page as it loads.
    if ((el.tag === "body" || el.tag === "html") && compounds.some((c) => c.toLowerCase() !== "html")) continue;
    const m = /^([a-z][a-z0-9]*)?((?:\.(?:\\.|[\w-])+)*)$/i.exec(last);
    if (!m || (!m[1] && !m[2])) continue;
    if (m[1] && m[1].toLowerCase() !== el.tag) continue;
    const classes = (m[2] ?? "").split(/(?<!\\)\./).filter(Boolean).map((c) => c.replace(/\\(.)/g, "$1"));
    if (classes.every((c) => el.classes.has(c))) return true;
  }
  return false;
}

const KEYWORDS = /^(?:inherit|initial|unset|revert|revert-layer)$/i;

/** A tiny cascade: the last declaration that applies to each element wins; custom properties resolve from the root. */
function cascade(css: string) {
  const decls = declarations(css);
  const vars = new Map<string, string>();
  for (const d of decls) {
    if (d.prop.startsWith("--") && /(?:^|,)\s*(?::root|html|body|:host|\*)\s*(?:,|$)/i.test(d.selector)) vars.set(d.prop, d.value);
  }
  const resolve = (value: string, depth = 0): string =>
    depth > 6
      ? value
      : value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (_all, name: string, fallback?: string) => {
          const v = vars.get(name) ?? fallback ?? "";
          return resolve(v.trim(), depth + 1);
        });
  /** The value an element ends up with; `inherited` is what its parent gives it when it says inherit or nothing. */
  const get = (el: El | null, prop: string, inherited?: string | null): string | null => {
    if (!el) return inherited ?? null;
    let found: string | null = null;
    for (const d of decls) {
      if (d.prop !== prop && !(prop === "background-color" && d.prop === "background") && !(prop === "font-size" && d.prop === "font") && !(prop === "font-family" && d.prop === "font")) continue;
      if (!matches(d.selector, el)) continue;
      const v = resolve(d.value);
      if (!v) continue;
      found = KEYWORDS.test(v) ? (inherited ?? null) : v;
    }
    return found ?? inherited ?? null;
  };
  return { get, resolve };
}

function px(value: string | null, rootPx: number, parentPx: number): number | null {
  if (!value) return null;
  // clamp(min, preferred, max): the size on a desktop screen is the max.
  const clamp = /clamp\(([^)]*)\)/.exec(value);
  const v = (clamp ? clamp[1]!.split(",").pop()! : value).trim();
  // calc(0.25rem * 14), the way Tailwind 4 writes sizes.
  const product = /calc\(\s*(-?\d*\.?\d+)(px|rem|em)\s*\*\s*(\d*\.?\d+)\s*\)/.exec(v);
  const m = product ?? /(-?\d*\.?\d+)(px|rem|em|%|pt)(?!\w)/.exec(v);
  if (!m) return null;
  const n = Number(m[1]) * (product ? Number(product[3]) : 1);
  switch (m[2]) {
    case "rem": return n * rootPx;
    case "em": return n * parentPx;
    case "%": return (n / 100) * parentPx;
    case "pt": return n * (4 / 3);
    case "px": return n;
    default: return null;
  }
}

function family(value: string | null): { name: string | null; kind: SiteMeasure["bodyKind"] } {
  if (!value) return { name: null, kind: null };
  // "font: 400 16px/1.5 Name, serif" keeps its family list after the size.
  const list = value.replace(/^.*?\d(?:px|rem|em|%)(?:\/[\d.]+\w*)?\s+/, "").split(",").map((f) => f.trim().replace(/^["']|["']$/g, ""));
  const generic = list.find((f) => /^(?:sans-serif|serif|monospace|ui-sans-serif|ui-serif|ui-monospace|system-ui)$/i.test(f)) ?? "";
  const name = list.find((f) => f && !/^(?:var\(|inherit|-apple-system|system-ui|ui-|sans-serif|serif|monospace|blinkmacsystemfont|segoe ui|helvetica|arial|__)/i.test(f)) ?? null;
  const kind = /mono/i.test(generic) || /\bmono\b|code|courier/i.test(name ?? "")
    ? "mono"
    : /^(?:ui-)?serif$/i.test(generic) || (/serif|garamond|caslon|times|georgia|playfair|fraunces|newsreader|lora|tiempos|canela/i.test(name ?? "") && !/sans/i.test(name ?? ""))
      ? "serif"
      : generic || name ? "sans" : null;
  return { name: name?.replace(/\s+(?:variable|fallback)$/i, "") ?? null, kind };
}

const weightOf = (value: string | null): number | null => {
  if (!value) return null;
  if (/^bold/i.test(value)) return 700;
  if (/^normal/i.test(value)) return 400;
  const n = Number(/\d{3}/.exec(value)?.[0]);
  return n >= 100 && n <= 900 ? n : null;
};

/** How the page is set, from its markup and CSS alone. A rendered measurement, when there is one, overrides it. */
export function measureCss(css: string, html: string): SiteMeasure {
  const m = emptyMeasure();
  const { get, resolve } = cascade(css);
  const root = elOf(html, "html") ?? { tag: "html", classes: new Set<string>() };
  const body = elOf(html, "body") ?? { tag: "body", classes: new Set<string>() };
  const hasH1 = /<h1\b/i.test(html);
  const h1 = elOf(html, "h1") ?? { tag: "h1", classes: new Set<string>() };
  const button = elOf(html, "button");

  const rootPx = px(get(root, "font-size"), 16, 16) ?? 16;
  // The first opaque color in a background value: a literal, or a named color such as ivory or linen.
  const colorIn = (value: string | null) => {
    if (!value) return null;
    const v = resolve(value);
    const literal = v.match(COLOR_RE)?.find((c) => safeColor(c));
    return literal ?? v.split(/[\s,]+/).find((t) => /^[a-z]{3,20}$/i.test(t) && safeColor(t)) ?? null;
  };
  m.background = colorIn(get(body, "background-color")) ?? colorIn(get(root, "background-color"));

  const bodyFamily = get(body, "font-family", get(root, "font-family"));
  const bodyFace = family(bodyFamily);
  m.bodyFont = bodyFace.name;
  m.bodyKind = bodyFace.kind;
  const bodySize = px(get(body, "font-size", get(root, "font-size")), rootPx, rootPx);
  if (bodySize && bodySize >= 10 && bodySize <= 32) m.bodySize = +bodySize.toFixed(1);

  const headFace = family(get(h1, "font-family", bodyFamily));
  m.headingFont = headFace.name;
  m.headingKind = headFace.kind;
  const headSize = px(get(h1, "font-size"), rootPx, m.bodySize ?? rootPx);
  if (headSize && headSize >= 16 && headSize <= 160) m.headingSize = +headSize.toFixed(1);
  // A weight the headline states is taken as read. One it inherits (a reset) or never mentions (the browser's bold)
  // is only reported when the headline's size was found too, so the reading is of this headline and not a guess.
  const bodyWeight = weightOf(get(body, "font-weight")) ?? 400;
  const styled = declarations(css).some((d) => d.prop === "font-weight" && matches(d.selector, h1));
  const stated = weightOf(get(h1, "font-weight", "inherited"));
  m.headingWeight = stated ?? (hasH1 && m.headingSize ? (styled ? bodyWeight : 700) : null);
  const tracking = get(h1, "letter-spacing");
  if (tracking) {
    const em = /(-?\d*\.?\d+)em/.exec(tracking);
    const inPx = /(-?\d*\.?\d+)px/.exec(tracking);
    m.headingTracking = /^(?:normal|0)\b/i.test(tracking.trim()) && !em && !inPx ? 0 : em ? Number(em[1]) : inPx && m.headingSize ? +(Number(inPx[1]) / m.headingSize).toFixed(3) : null;
  } else if (m.headingSize) m.headingTracking = 0;

  if (button) {
    const size = px(get(button, "font-size"), rootPx, m.bodySize ?? rootPx) ?? m.bodySize ?? rootPx;
    const height = px(get(button, "height") ?? get(button, "min-height"), rootPx, size);
    const pad = get(button, "padding-top") ?? get(button, "padding-block") ?? get(button, "padding");
    const padY = px(pad?.split(/\s+/)[0] ?? null, rootPx, size);
    const h = height ?? (padY !== null ? padY * 2 + size * 1.4 : null);
    if (h && h >= 24 && h <= 80) m.controlHeight = Math.round(h);
    const r = px(get(button, "border-radius"), rootPx, size);
    if (r !== null && r >= 0 && r <= 24) m.radius = Math.round(r);
  }
  return m;
}

/** A page color worth keeping: light or dark enough to be a ground, and not plain white or the stock near-black. */
export function ownPage(background: string | null): { css: string; hex: string } | null {
  const c = background ? safeColor(background) : null;
  if (!c) return null;
  const plainWhite = c.l >= 0.975 && c.c < 0.006;
  const stockDark = Math.abs(c.l - 0.145) < 0.03 && c.c < 0.008;
  if ((c.l >= 0.82 && !plainWhite) || (c.l <= 0.28 && !stockDark)) return { css: toCss({ l: c.l, c: c.c, h: c.h }), hex: toHex(c) };
  return null;
}

type Roles = Pick<SiteMeasure, "bodyFont" | "headingFont" | "bodyKind" | "headingKind">;

/**
 * The faces a site uses that are in the catalog, in a shape a patch can set.
 * When it's known which face sets text and which sets headlines, each keeps
 * its job; otherwise the most used faces fill the roles they can carry.
 */
export function catalogFontsForSite(fonts: string[], roles?: Partial<Roles>): { sans: string; mono: string; display: string | null } | null {
  const found = fonts.map((f) => findFont(f)).filter((e): e is NonNullable<ReturnType<typeof findFont>> => !!e);
  const mono = found.find((e) => e.kind === "mono");
  const bodyFace = roles?.bodyFont ? findFont(roles.bodyFont) : null;
  const headFace = roles?.headingFont ? findFont(roles.headingFont) : null;
  if (bodyFace?.roles.includes("body")) {
    // The same face for both, or a headline face the catalog doesn't have: no display face rather than a guess.
    const display = headFace && headFace !== bodyFace && headFace.roles.includes("display") ? headFace.id : null;
    if (display || !roles?.headingFont || headFace === bodyFace) return { sans: bodyFace.id, mono: mono?.id ?? "jetbrains-mono", display };
  }
  if (headFace?.roles.includes("display") && !bodyFace) {
    const body = found.find((e) => e.roles.includes("body") && e.kind !== "mono" && e !== headFace);
    if (body) return { sans: body.id, mono: mono?.id ?? "jetbrains-mono", display: headFace.id };
  }
  if (roles?.bodyFont || roles?.headingFont) return null;
  const body = found.find((e) => e.roles.includes("body") && e.kind !== "mono");
  const display = found.find((e) => e.roles.includes("display") && e !== body && e.kind !== "mono");
  if (!body && !display) return null;
  return { sans: body?.id ?? "inter", mono: mono?.id ?? "jetbrains-mono", display: display?.id ?? null };
}

/** The closest pairing: one that has a face the site uses, or one with the same shape (serif headlines, serif text, monospace). */
export function pairingForFonts(fonts: string[], roles?: Partial<Roles>): string | null {
  const headFace = roles?.headingFont ? findFont(roles.headingFont) : null;
  const bodyFace = roles?.bodyFont ? findFont(roles.bodyFont) : null;
  if (roles?.bodyKind || roles?.headingKind) {
    const serifHead = roles.headingKind === "serif";
    const serifBody = roles.bodyKind === "serif";
    // A pairing that keeps a known face in the job the site gives it.
    const exact = PAIRINGS.find((p) => (bodyFace && p.sans.font === bodyFace.id && (!headFace || headFace === bodyFace || p.display?.font === headFace.id)) || (headFace && headFace !== bodyFace && p.display?.font === headFace.id));
    if (exact) return exact.id;
    if (roles.bodyKind === "mono") return "terminal-mono";
    if (serifBody) return "source-serif";
    if (serifHead) return "newsroom";
    if (roles.headingKind === "mono") return "martian";
    return null;
  }
  for (const f of fonts) {
    const entry = findFont(f);
    if (!entry) continue;
    const p = PAIRINGS.find((x) => x.sans.font === entry.id || x.display?.font === entry.id);
    if (p) return p.id;
  }
  const serif = fonts.some((f) => /serif|garamond|caslon|times|georgia|playfair|fraunces|newsreader|lora/i.test(f) && !/sans/i.test(f));
  const mono = fonts.some((f) => /mono|code|courier/i.test(f));
  if (serif) return "instrument";
  if (mono) return "plex";
  return null;
}

/** Fill in a reading with what a rendered page measured: what the browser drew outranks what the CSS implied. */
export function mergeMeasure(css: SiteMeasure, rendered: Partial<SiteMeasure> | null | undefined): SiteMeasure {
  const out = { ...css };
  if (!rendered) return out;
  for (const k of Object.keys(out) as (keyof SiteMeasure)[]) {
    const v = rendered[k];
    if (v !== null && v !== undefined && v !== "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export interface ExtractOptions {
  signal?: AbortSignal;
  /** Measure the rendered page (computed styles in a real browser). Optional: without it, the CSS is read on its own. */
  measure?: (url: string) => Promise<Partial<SiteMeasure> | null>;
}

export async function extractFromSite(input: string, options: AbortSignal | ExtractOptions = {}): Promise<SiteMaterial> {
  const opts: ExtractOptions = options instanceof AbortSignal ? { signal: options } : options;
  const signal = opts.signal;
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).toString();
  // The rendered page is measured while its source is fetched; a browser that isn't there or a page that won't load costs nothing.
  const renderedLater = opts.measure ? opts.measure(url).catch(() => null) : Promise.resolve(null);
  const html = await fetchText(url, MAX_HTML, signal);

  const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? meta(html, "og:title") ?? "").trim();
  const description = (meta(html, "description") ?? meta(html, "og:description") ?? "").trim();
  const themeColor = meta(html, "theme-color");

  let css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  css += "\n" + [...html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(";\n");
  const sheets = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /rel\s*=\s*["'][^"']*stylesheet/i.test(tag))
    .map((tag) => attr(tag, "href"))
    .filter((h): h is string => !!h && !/fonts\.googleapis/.test(h))
    .slice(0, MAX_SHEETS);
  const results = await Promise.allSettled(sheets.map((h) => fetchText(new URL(h, url).toString(), MAX_CSS, signal)));
  for (const r of results) if (r.status === "fulfilled") css += "\n" + r.value;

  const { colors, neutral } = rankColors(css, themeColor);
  const rendered = await renderedLater;
  const measure = mergeMeasure(measureCss(css, html), rendered);
  // The faces the page is actually set in lead the list, ahead of ones merely declared.
  const declared = fontsIn(css, html);
  const fonts = [...new Set([measure.headingFont, measure.bodyFont, ...declared].filter((f): f is string => !!f))].slice(0, 5);
  const radius = measure.radius ?? radiusIn(css);
  const theme = themeColor ? safeColor(themeColor) : null;
  const scheme = meta(html, "color-scheme") ?? "";
  const ground = measure.background ? safeColor(measure.background) : null;
  const dark = ground ? ground.l < 0.3 : (theme ? theme.l < 0.3 : false) || /^dark\b/i.test(scheme.trim());
  const page = ownPage(measure.background);
  const pairing = pairingForFonts(fonts, measure);
  const catalogFonts = catalogFontsForSite(fonts, measure);

  const summary = [
    `Site: ${url}`,
    title && `Title: ${title}`,
    description && `Description: ${description}`,
    themeColor && `theme-color: ${themeColor}`,
    colors.length && `Most used brand-like colors: ${colors.map((c) => `${c.hex} (score ${c.score})`).join(", ")}`,
    neutral && `Grays lean ${neutral}`,
    page && `Page color (its own, keep it): ${page.hex}`,
    fonts.length && `Fonts: ${fonts.join(", ")}`,
    measure.headingFont && `Headlines are set in ${measure.headingFont}${measure.headingWeight ? ` at weight ${measure.headingWeight}` : ""}${measure.headingSize ? `, ${Math.round(measure.headingSize)}px` : ""}`,
    measure.bodyFont && `Text is set in ${measure.bodyFont}${measure.bodySize ? ` at ${Math.round(measure.bodySize)}px` : ""}`,
    !measure.bodyFont && measure.bodySize && `Body text is ${Math.round(measure.bodySize)}px`,
    measure.controlHeight && `Main buttons are ${measure.controlHeight}px tall`,
    radius !== null && `Typical corner radius: ${radius}px`,
    dark && "The site appears to be dark-first",
  ]
    .filter(Boolean)
    .join("\n");

  return { url, title, description, themeColor, colors, neutral, fonts, pairing, catalogFonts, radius, dark, page, measure, measuredFrom: rendered ? "rendered" : "css", summary };
}

const WEIGHTS = [300, 400, 500, 600, 700];

/**
 * A scale ratio that puts the site's main headline on a step. It's tried as
 * the hero step first (six above body text), then the steps around it.
 */
export function ratioFor(bodySize: number, headingSize: number): number | null {
  if (headingSize < bodySize * 1.4) return null;
  for (const k of [6, 5, 7, 4, 3]) {
    const r = (headingSize / bodySize) ** (1 / k);
    if (r >= 1.125 && r <= 1.333) return +r.toFixed(3);
  }
  return null;
}

/** A patch from what the site shows, without a model. */
export function patchFromSite(m: SiteMaterial): Partial<DesignPatch> {
  const patch: Partial<DesignPatch> = {};
  if (m.colors[0]) patch.brand = m.colors[0].hex;
  if (m.neutral) patch.neutral = m.neutral;
  // The site's own faces when the catalog has them; otherwise the closest pairing.
  if (m.catalogFonts && !PAIRINGS.some((p) => p.sans.font === m.catalogFonts!.sans && (p.display?.font ?? null) === m.catalogFonts!.display)) patch.fonts = m.catalogFonts;
  else if (m.pairing) patch.pairing = m.pairing;
  if (m.radius !== null) patch.radius = m.radius;
  if (m.dark) patch.defaultMode = "dark";
  // What the page measured stays as it is: its ground, its sizes, the weight of its headlines, the height of its buttons.
  const t = m.measure;
  if (m.page) patch.page = m.page.hex;
  if (t.bodySize) {
    patch.baseSize = Math.round(Math.min(22, Math.max(14, t.bodySize)));
    const ratio = t.headingSize ? ratioFor(patch.baseSize, t.headingSize) : null;
    if (ratio) patch.ratio = ratio;
  }
  if (t.headingWeight) patch.headingWeight = WEIGHTS.reduce((a, b) => (Math.abs(b - t.headingWeight!) < Math.abs(a - t.headingWeight!) ? b : a));
  if (t.headingTracking !== null) patch.tracking = t.headingTracking <= -0.012 ? "tight" : "normal";
  if (t.controlHeight) patch.density = t.controlHeight >= 44 ? "spacious" : t.controlHeight >= 35 ? "comfortable" : "compact";
  return patch;
}
