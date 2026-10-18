import type { DesignConfig } from "./schema.js";

/**
 * The font catalog. Every family here is under the SIL Open Font License and
 * ships as an npm package, so a generated system can be committed to a public
 * MIT repo and installed offline. The Google Fonts name sits in the fallback
 * stack, so previews and apps that load fonts from Google render the same face.
 */

export type FontRole = "sans" | "mono" | "display";

export interface FontEntry {
  id: string;
  /** The family name the npm package registers. */
  family: string;
  /** The family name on Google Fonts, for previews served from there. */
  google: string;
  package: string;
  /** Weights the files cover; a system may use up to three of them. */
  available: number[];
  kind: "sans" | "serif" | "mono";
  license: "OFL-1.1";
}

const SANS_FALLBACK = ["ui-sans-serif", "system-ui", "sans-serif"];
const MONO_FALLBACK = ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"];
const SERIF_FALLBACK = ["ui-serif", "Georgia", "serif"];

const variable = (id: string, name: string, kind: FontEntry["kind"], available = [300, 400, 500, 600, 700]): FontEntry => ({
  id,
  family: `${name} Variable`,
  google: name,
  package: `@fontsource-variable/${id}`,
  available,
  kind,
  license: "OFL-1.1",
});

export const FONTS: Record<string, FontEntry> = {
  geist: variable("geist", "Geist", "sans"),
  "geist-mono": variable("geist-mono", "Geist Mono", "mono"),
  "instrument-sans": variable("instrument-sans", "Instrument Sans", "sans", [400, 500, 600, 700]),
  "instrument-serif": {
    id: "instrument-serif",
    family: "Instrument Serif",
    google: "Instrument Serif",
    package: "@fontsource/instrument-serif",
    available: [400],
    kind: "serif",
    license: "OFL-1.1",
  },
  "ibm-plex-sans": variable("ibm-plex-sans", "IBM Plex Sans", "sans"),
  "jetbrains-mono": variable("jetbrains-mono", "JetBrains Mono", "mono"),
  figtree: variable("figtree", "Figtree", "sans"),
  "dm-sans": variable("dm-sans", "DM Sans", "sans"),
  "bricolage-grotesque": variable("bricolage-grotesque", "Bricolage Grotesque", "sans", [300, 400, 500, 600, 700]),
  "red-hat-mono": variable("red-hat-mono", "Red Hat Mono", "mono"),
  manrope: variable("manrope", "Manrope", "sans"),
  "fira-code": variable("fira-code", "Fira Code", "mono"),
};

export interface Pairing {
  id: string;
  name: string;
  /** One line on what the pairing feels like, shown in onboarding. */
  note: string;
  sans: { font: string; weights: number[] };
  mono: { font: string; weights: number[] };
  display?: { font: string; weights: number[] };
}

/** Curated pairings. Onboarding offers these instead of an open font list. */
export const PAIRINGS: Pairing[] = [
  {
    id: "geist",
    name: "Geist",
    note: "Neutral and exact. Reads like a precise tool.",
    sans: { font: "geist", weights: [400, 500, 600] },
    mono: { font: "geist-mono", weights: [400, 500] },
  },
  {
    id: "instrument",
    name: "Instrument",
    note: "A serif voice for headlines, a clean sans for the work.",
    display: { font: "instrument-serif", weights: [400] },
    sans: { font: "instrument-sans", weights: [400, 500, 600] },
    mono: { font: "jetbrains-mono", weights: [400, 500] },
  },
  {
    id: "plex",
    name: "Plex",
    note: "Engineered. Built for data, logs and dense screens.",
    sans: { font: "ibm-plex-sans", weights: [400, 500, 600] },
    mono: { font: "jetbrains-mono", weights: [400, 500] },
  },
  {
    id: "figtree",
    name: "Figtree",
    note: "Friendly and round without being cute.",
    sans: { font: "figtree", weights: [400, 500, 600] },
    mono: { font: "geist-mono", weights: [400, 500] },
  },
  {
    id: "bricolage",
    name: "Bricolage",
    note: "Headlines with character over a quiet body face.",
    display: { font: "bricolage-grotesque", weights: [600, 700] },
    sans: { font: "dm-sans", weights: [400, 500, 600] },
    mono: { font: "red-hat-mono", weights: [400, 500] },
  },
  {
    id: "manrope",
    name: "Manrope",
    note: "Modern and geometric. Works for product and marketing alike.",
    sans: { font: "manrope", weights: [400, 500, 600] },
    mono: { font: "fira-code", weights: [400, 500] },
  },
];

type FontInput = NonNullable<DesignConfig["type"]["display"]>;

function fontConfig(entry: FontEntry, weights: number[]): FontInput {
  const base = entry.kind === "mono" ? MONO_FALLBACK : entry.kind === "serif" ? SERIF_FALLBACK : SANS_FALLBACK;
  return {
    family: entry.family,
    fallback: [entry.google, ...base],
    weights: weights as FontInput["weights"],
    package: entry.package,
    license: entry.license,
  };
}

/** The `type` fonts for a pairing, ready to drop into a design config. */
export function pairingFonts(id: string): { sans: FontInput; mono: FontInput; display?: FontInput } {
  const p = PAIRINGS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown font pairing "${id}". Available: ${PAIRINGS.map((x) => x.id).join(", ")}`);
  const get = (f: string) => {
    const e = FONTS[f];
    if (!e) throw new Error(`Unknown font "${f}"`);
    return e;
  };
  return {
    sans: fontConfig(get(p.sans.font), p.sans.weights),
    mono: fontConfig(get(p.mono.font), p.mono.weights),
    ...(p.display ? { display: fontConfig(get(p.display.font), p.display.weights) } : {}),
  };
}

/** Which pairing a config uses, matched by its sans and display families. */
export function pairingOf(config: Pick<DesignConfig, "type">): string | null {
  for (const p of PAIRINGS) {
    const sans = FONTS[p.sans.font]!.family;
    const display = p.display ? FONTS[p.display.font]!.family : undefined;
    if (config.type.sans.family === sans && config.type.display?.family === display) return p.id;
  }
  return null;
}

/** Find a catalog font by any family name a site might use ("Geist", "Geist Variable", "geist"). */
export function findFont(name: string): FontEntry | null {
  const n = name.trim().replace(/^["']|["']$/g, "").toLowerCase().replace(/\s+variable$/, "");
  return Object.values(FONTS).find((f) => f.google.toLowerCase() === n || f.id === n.replace(/\s+/g, "-")) ?? null;
}
