import { findFont, PAIRINGS, parseColor, toCss, toHex, type Oklch } from "@auto-design/core";
import type { DesignPatch } from "./patch.js";
import { lookPatch, type Look } from "./look.js";

/**
 * Read a live site for hints: its brand color, grays, fonts and corners. This
 * runs without a model. The result is a suggestion the person confirms, never
 * a final value.
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
  /** What was read, for the model and for the person. */
  summary: string;
  /** How the page looks (imagery, composition, labels, logo, ink), when a browser read it. */
  look?: Look;
}

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

/** The faces a site uses that are in the catalog, in a shape a patch can set. */
export function catalogFontsForSite(fonts: string[]): { sans: string; mono: string; display: string | null } | null {
  const found = fonts.map((f) => findFont(f)).filter((e): e is NonNullable<ReturnType<typeof findFont>> => !!e);
  const body = found.find((e) => e.roles.includes("body") && e.kind !== "mono");
  const display = found.find((e) => e.roles.includes("display") && e !== body && e.kind !== "mono");
  const mono = found.find((e) => e.kind === "mono");
  if (!body && !display) return null;
  return { sans: body?.id ?? "inter", mono: mono?.id ?? "jetbrains-mono", display: display?.id ?? null };
}

/** The pairing whose sans or display face matches one of the site's fonts. */
export function pairingForFonts(fonts: string[]): string | null {
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

export async function extractFromSite(input: string, signal?: AbortSignal): Promise<SiteMaterial> {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).toString();
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
  const fonts = fontsIn(css, html);
  const radius = radiusIn(css);
  const theme = themeColor ? safeColor(themeColor) : null;
  const scheme = meta(html, "color-scheme") ?? "";
  const dark = (theme ? theme.l < 0.3 : false) || /^dark\b/i.test(scheme.trim());
  const pairing = pairingForFonts(fonts);
  const catalogFonts = catalogFontsForSite(fonts);

  const summary = [
    `Site: ${url}`,
    title && `Title: ${title}`,
    description && `Description: ${description}`,
    themeColor && `theme-color: ${themeColor}`,
    colors.length && `Most used brand-like colors: ${colors.map((c) => `${c.hex} (score ${c.score})`).join(", ")}`,
    neutral && `Grays lean ${neutral}`,
    fonts.length && `Fonts: ${fonts.join(", ")}`,
    radius !== null && `Typical corner radius: ${radius}px`,
    dark && "The site appears to be dark-first",
  ]
    .filter(Boolean)
    .join("\n");

  return { url, title, description, themeColor, colors, neutral, fonts, pairing, catalogFonts, radius, dark, summary };
}

/** A patch from what the site shows, without a model. */
export function patchFromSite(m: SiteMaterial): Partial<DesignPatch> {
  // What a browser saw (art direction, the buttons' real color, ink) comes first; the CSS fills the rest.
  const patch: Partial<DesignPatch> = m.look ? lookPatch(m.look) : {};
  if (!patch.brand && m.colors[0]) patch.brand = m.colors[0].hex;
  if (m.neutral) patch.neutral = m.neutral;
  // The site's own faces when the catalog has them; otherwise the closest pairing.
  if (m.catalogFonts && !PAIRINGS.some((p) => p.sans.font === m.catalogFonts!.sans && (p.display?.font ?? null) === m.catalogFonts!.display)) patch.fonts = m.catalogFonts;
  else if (m.pairing && !patch.fonts) patch.pairing = m.pairing;
  if (m.radius !== null) patch.radius = m.radius;
  if (m.dark) patch.defaultMode = "dark";
  return patch;
}
