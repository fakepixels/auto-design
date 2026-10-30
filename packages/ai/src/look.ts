import { DEFAULT_ART, FONT_CATALOG, findFont, type Art } from "@auto-design/core";
import type { DesignPatch } from "./patch.js";

/**
 * How a reference looks, read the way a designer would: how much of its first screen is photography,
 * the shape of that screen, how its collections sit, its labels, how far its headlines rise above the
 * text, its logo, and whether the interface itself carries color or leaves it to the photos. Read from a
 * live page (measured in a browser), from screenshots (measured in pixels), or by a model.
 */
export interface Look {
  source: "site" | "images";
  imagery: Art["imagery"];
  hero: Art["hero"];
  grid: Art["grid"];
  labels: Art["labels"];
  display: Art["display"];
  logo: Art["logo"];
  /** The interface is black, white and gray; any color lives in the photos. */
  ink: boolean;
  /** The ink to use as the brand when it is (the color of the main buttons or the text), as hex. */
  inkColor: string | null;
  dark: boolean;
  /** Share of the first screen covered by photography, 0 to 1. */
  photoShare: number;
  /** The headline's size over the body text's. */
  headlineRatio: number | null;
  /** The headline's face, when one was read. */
  headlineFont: string | null;
  /** Colors the interface itself uses (buttons, links), strongest first, as hex. Not the photos'. */
  uiColors: string[];
  /** What was seen, in plain words, for the person. */
  facts: string[];
}

/** What the browser measures on a live page (see MEASURE_SCRIPT in the CLI). Every field is optional. */
export interface PageMeasure {
  width: number;
  height: number;
  photoShare: number;
  fullBleed: boolean;
  split: boolean;
  centered: boolean;
  headline: { size: number; family: string; text: string } | null;
  bodySize: number;
  nav: { count: number; upper: number; tracked: number };
  logo: { centered: boolean; text: boolean; upper: boolean; tracked: boolean } | null;
  collection: { items: number; boxed: boolean; uneven: boolean; pictured: boolean } | null;
  ctas: { bg: string; fg: string; weight: number }[];
  links: { color: string; weight: number }[];
  pageBg: string;
  text: string;
  radius: number | null;
  fonts: string[];
}

const hexRgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Rough chroma in 0-255 units: how far a color is from a gray. */
const chroma = (hex: string) => {
  const c = hexRgb(hex);
  return c ? Math.max(...c) - Math.min(...c) : 0;
};
const luminance = (hex: string) => {
  const c = hexRgb(hex);
  if (!c) return 0.5;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** A color that reads as color, not as a gray, near-black or near-white. */
export const isChromatic = (hex: string) => {
  const l = luminance(hex);
  return chroma(hex) >= 40 && l > 0.02 && l < 0.85;
};

const SERIF = /serif|garamond|caslon|bodoni|didot|playfair|cormorant|baskerville|times|georgia|fraunces|newsreader|lora|libre|prata|marcellus|cinzel|italiana|tenor|gloock|young serif|dm serif|instrument serif/i;

function isSerif(family: string | null): boolean {
  if (!family) return false;
  const entry = findFont(family);
  if (entry) return entry.kind === "serif";
  return SERIF.test(family) && !/sans/i.test(family);
}

/** Turn what a browser measured into a look. Pure, so it can be tested without one. */
export function lookFromPage(m: PageMeasure): Look {
  const imagery: Art["imagery"] = m.photoShare >= 0.42 || m.fullBleed ? "leading" : m.photoShare >= 0.1 ? "supporting" : "none";
  const hero: Art["hero"] = m.fullBleed ? "full-bleed" : m.split ? "split" : m.centered ? "centered" : "type";
  const ratio = m.headline && m.bodySize ? m.headline.size / m.bodySize : null;
  const display: Art["display"] = ratio !== null && ratio >= 3.4 ? "dramatic" : "standard";
  const upperNav = m.nav.count >= 2 && m.nav.upper / m.nav.count >= 0.5;
  const labels: Art["labels"] = upperNav ? "uppercase" : "sentence";
  const logo: Art["logo"] = m.logo && (m.logo.centered || (m.logo.text && m.logo.upper && m.logo.tracked)) ? "wordmark" : "mark";
  const grid: Art["grid"] = m.collection ? (m.collection.uneven ? "editorial" : m.collection.boxed ? "cards" : "open") : imagery === "leading" ? "open" : DEFAULT_ART.grid;

  // The interface's own colors: main buttons first, then links, by how much of the page they cover.
  const weighted = new Map<string, number>();
  for (const c of m.ctas) weighted.set(c.bg, (weighted.get(c.bg) ?? 0) + c.weight * 3);
  for (const l of m.links) weighted.set(l.color, (weighted.get(l.color) ?? 0) + l.weight);
  const ranked = [...weighted.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const uiColors = ranked.filter(isChromatic);
  const ctaChromatic = m.ctas.filter((c) => isChromatic(c.bg)).reduce((n, c) => n + c.weight, 0);
  const ctaAll = m.ctas.reduce((n, c) => n + c.weight, 0);
  const ink = uiColors.length === 0 || (ctaAll > 0 && ctaChromatic / ctaAll < 0.2 && imagery !== "none");
  const dark = luminance(m.pageBg) < 0.2;
  const inkCta = m.ctas.find((c) => !isChromatic(c.bg) && Math.abs(luminance(c.bg) - luminance(m.pageBg)) > 0.3)?.bg;
  const inkColor = ink ? (inkCta ?? (dark ? "#f2f2f2" : m.text && !isChromatic(m.text) ? m.text : "#111111")) : null;

  const look: Look = {
    source: "site",
    imagery,
    hero,
    grid,
    labels,
    display,
    logo,
    ink,
    inkColor,
    dark,
    photoShare: Math.round(m.photoShare * 100) / 100,
    headlineRatio: ratio !== null ? Math.round(ratio * 10) / 10 : null,
    headlineFont: m.headline?.family ?? null,
    uiColors: uiColors.slice(0, 4),
    facts: [],
  };
  look.facts = lookFacts(look);
  return look;
}

/** What screenshots show, measured in the browser from their pixels (see readLook in onboarding). */
export interface PixelMeasure {
  /** Share of the area that reads as photography. */
  photoShare: number;
  /** Share of the top band, full width, that is photography: a full-bleed first screen. */
  topBand: number;
  /** Photography sits mostly in one half, the words in the other. */
  oneSide: boolean;
  /** Flat areas (the interface) that carry color, as a share of all flat area. */
  flatChromatic: number;
  /** The flat areas' main colors, strongest first, as hex. */
  flatColors: string[];
  dark: boolean;
}

/** A look from screenshots' pixels alone: imagery, the first screen and whether the interface is ink. */
export function lookFromPixels(list: PixelMeasure[]): Look | null {
  if (!list.length) return null;
  const avg = (f: (p: PixelMeasure) => number) => list.reduce((n, p) => n + f(p), 0) / list.length;
  const photoShare = avg((p) => p.photoShare);
  const topBand = Math.max(...list.map((p) => p.topBand));
  const imagery: Art["imagery"] = photoShare >= 0.38 ? "leading" : photoShare >= 0.1 ? "supporting" : "none";
  const hero: Art["hero"] = topBand >= 0.7 ? "full-bleed" : list.some((p) => p.oneSide) ? "split" : imagery === "none" ? "type" : "centered";
  const dark = list.filter((p) => p.dark).length > list.length / 2;
  const uiColors = [...new Set(list.flatMap((p) => p.flatColors))].filter(isChromatic).slice(0, 4);
  const ink = avg((p) => p.flatChromatic) < 0.04;
  const look: Look = {
    source: "images",
    imagery,
    hero,
    grid: imagery === "leading" ? "open" : DEFAULT_ART.grid,
    labels: DEFAULT_ART.labels,
    display: DEFAULT_ART.display,
    logo: DEFAULT_ART.logo,
    ink,
    inkColor: ink ? (dark ? "#f2f2f2" : "#111111") : null,
    dark,
    photoShare: Math.round(photoShare * 100) / 100,
    headlineRatio: null,
    headlineFont: null,
    uiColors,
    facts: [],
  };
  look.facts = lookFacts(look);
  return look;
}

/** The look in plain words: what the person sees before anything is built. */
export function lookFacts(look: Look): string[] {
  const facts: string[] = [];
  if (look.imagery === "leading") facts.push("Photography leads");
  else if (look.imagery === "supporting") facts.push("Photos support the words");
  else facts.push("Type leads, no photography");
  const hero: Record<Art["hero"], string> = {
    "full-bleed": "a full-bleed first screen",
    split: "words beside a picture",
    centered: "a centered first screen",
    editorial: "a magazine-style first screen",
    type: "a headline-only first screen",
  };
  facts.push(hero[look.hero].replace(/^./, (c) => c.toUpperCase()));
  if (look.logo === "wordmark") facts.push("A centered wordmark");
  if (look.labels === "uppercase") facts.push("Uppercase labels");
  if (look.headlineRatio && look.headlineRatio >= 2) facts.push(`Headlines ${look.headlineRatio}× the text`);
  else if (look.display === "dramatic") facts.push("Dramatic headlines");
  if (look.headlineFont) facts.push(`${isSerif(look.headlineFont) ? "Serif" : "Sans"} headlines (${look.headlineFont})`);
  if (look.ink) facts.push(look.dark ? "A white-on-black interface; the color is in the photos" : "A black-and-white interface; the color is in the photos");
  else if (look.uiColors[0]) facts.push(`Interface color ${look.uiColors[0]}`);
  if (look.grid === "open" && look.imagery !== "none") facts.push("Products without boxes");
  else if (look.grid === "editorial") facts.push("One large item beside smaller ones");
  return facts;
}

/** A patch from a look: its art direction, and an ink brand when the interface leaves color to the photos. */
export function lookPatch(look: Look): Partial<DesignPatch> {
  const patch: Partial<DesignPatch> = {
    imagery: look.imagery,
    hero: look.hero,
    grid: look.grid,
    labels: look.labels,
    display: look.display,
    logo: look.logo,
  };
  if (look.ink && look.inkColor) patch.brand = look.inkColor;
  else if (look.uiColors[0]) patch.brand = look.uiColors[0];
  if (look.dark) patch.defaultMode = "dark";
  // Serif headlines keep a serif display face: the reference's own when the catalog has it, else a close one
  // (a house's custom serif becomes an open-source face of the same kind, never the body face).
  if (look.headlineFont && isSerif(look.headlineFont)) {
    const face = findFont(look.headlineFont);
    const display = face && face.kind === "serif" && face.roles.includes("display") ? face.id : look.display === "dramatic" && look.imagery === "leading" ? "cormorant-garamond" : "instrument-serif";
    patch.fonts = { sans: "inter", mono: "jetbrains-mono", display };
  }
  return patch;
}

/** The catalog's serif display faces, for prompts that need to name one. */
export const serifDisplayFaces = () => FONT_CATALOG.filter((f) => f.kind === "serif" && f.roles.includes("display")).map((f) => f.id);
