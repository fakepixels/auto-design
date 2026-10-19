import { FONT_WEIGHTS, type DesignConfig } from "./schema.js";
import { FONT_CATALOG } from "./font-catalog.js";

export { FONT_CATALOG };

/**
 * The font catalog. Every family here is under the SIL Open Font License and
 * ships as an npm package, so a generated system can be committed to a public
 * MIT repo and installed offline. The Google Fonts name sits in the fallback
 * stack, so previews and apps that load fonts from Google render the same face.
 */

export type FontRole = "sans" | "mono" | "display";

/** How a face looks, for grouping in pickers. */
export type FontStyle =
  | "grotesque"
  | "geometric"
  | "humanist"
  | "rounded"
  | "condensed"
  | "display"
  | "serif"
  | "display-serif"
  | "didone"
  | "slab"
  | "mono"
  | "pixel"
  | "script";

export interface FontEntry {
  id: string;
  /** The family name the npm package registers. */
  family: string;
  /** The family name on Google Fonts, for previews served from there. */
  google: string;
  package: string;
  /** Weights the files cover; a system may use up to three of them. */
  available: number[];
  italic: boolean;
  /** Which generic family it falls back to. */
  kind: "sans" | "serif" | "mono";
  style: FontStyle;
  /** Where it may go: running text and UI (body), headlines (display), code (mono). */
  roles: ("body" | "display" | "mono")[];
  /** One line on how it feels. */
  note: string;
  license: "OFL-1.1";
}

export const FONT_STYLES: { id: FontStyle; name: string }[] = [
  { id: "grotesque", name: "Grotesque" },
  { id: "geometric", name: "Geometric" },
  { id: "humanist", name: "Humanist" },
  { id: "rounded", name: "Rounded" },
  { id: "condensed", name: "Condensed" },
  { id: "display", name: "Display" },
  { id: "serif", name: "Serif" },
  { id: "display-serif", name: "Display serif" },
  { id: "didone", name: "High contrast" },
  { id: "slab", name: "Slab" },
  { id: "mono", name: "Monospace" },
  { id: "pixel", name: "Pixel" },
  { id: "script", name: "Handwritten" },
];

const SANS_FALLBACK = ["ui-sans-serif", "system-ui", "sans-serif"];
const MONO_FALLBACK = ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"];
const SERIF_FALLBACK = ["ui-serif", "Georgia", "serif"];

export const FONTS: Record<string, FontEntry> = Object.fromEntries(FONT_CATALOG.map((f) => [f.id, f]));

/** Faces that can carry each role. */
export const fontsFor = (role: "body" | "display" | "mono"): FontEntry[] => FONT_CATALOG.filter((f) => f.roles.includes(role));

/** The moods pairings are grouped by in onboarding. */
export const MOODS = [
  { id: "neutral", name: "Neutral", note: "Quiet faces that let the product speak." },
  { id: "friendly", name: "Friendly", note: "Warm, round and approachable." },
  { id: "editorial", name: "Editorial", note: "Serifs and contrast, for reading and storytelling." },
  { id: "technical", name: "Technical", note: "Engineered faces and monospace, for developers and data." },
  { id: "expressive", name: "Expressive", note: "Headlines with a point of view." },
  { id: "luxury", name: "Refined", note: "High contrast and generous spacing." },
  { id: "playful", name: "Playful", note: "Bubbly, retro and fun." },
] as const;

export type Mood = (typeof MOODS)[number]["id"];

export interface Pairing {
  id: string;
  name: string;
  /** One line on what the pairing feels like, shown in onboarding. */
  note: string;
  mood: Mood;
  sans: { font: string; weights: number[] };
  mono: { font: string; weights: number[] };
  display?: { font: string; weights: number[] };
}

const P = (id: string, name: string, mood: Mood, note: string, sans: [string, number[]], mono: [string, number[]], display?: [string, number[]]): Pairing => ({
  id,
  name,
  mood,
  note,
  sans: { font: sans[0], weights: sans[1] },
  mono: { font: mono[0], weights: mono[1] },
  ...(display ? { display: { font: display[0], weights: display[1] } } : {}),
});

const TEXT = [400, 500, 600];
const CODE = [400, 500];

/** Curated pairings. Onboarding offers these first; any catalog face can also be picked by hand. */
export const PAIRINGS: Pairing[] = [
  // The originals keep their ids: presets and existing systems point at them.
  P("geist", "Geist", "neutral", "Neutral and exact. Reads like a precise tool.", ["geist", TEXT], ["geist-mono", CODE]),
  P("instrument", "Instrument", "editorial", "A serif voice for headlines, a clean sans for the work.", ["instrument-sans", TEXT], ["jetbrains-mono", CODE], ["instrument-serif", [400]]),
  P("plex", "Plex", "technical", "Engineered. Built for data, logs and dense screens.", ["ibm-plex-sans", TEXT], ["jetbrains-mono", CODE]),
  P("figtree", "Figtree", "friendly", "Friendly and round without being cute.", ["figtree", TEXT], ["geist-mono", CODE]),
  P("bricolage", "Bricolage", "expressive", "Headlines with character over a quiet body face.", ["dm-sans", TEXT], ["red-hat-mono", CODE], ["bricolage-grotesque", [600, 700]]),
  P("manrope", "Manrope", "friendly", "Modern and geometric. Works for product and marketing alike.", ["manrope", TEXT], ["fira-code", CODE]),

  // Neutral
  P("inter", "Inter", "neutral", "The everyday workhorse. Disappears into the interface.", ["inter", TEXT], ["jetbrains-mono", CODE]),
  P("public", "Public Sans", "neutral", "Plain, civic and trustworthy.", ["public-sans", TEXT], ["roboto-mono", CODE]),
  P("hanken", "Hanken Grotesk", "neutral", "A crisp grotesk with some warmth.", ["hanken-grotesk", TEXT], ["fragment-mono", [400]]),
  P("source", "Source", "neutral", "Adobe's open family: readable at every size.", ["source-sans-3", TEXT], ["source-code-pro", CODE]),
  P("atkinson", "Atkinson", "neutral", "Designed for legibility first. The accessible choice.", ["atkinson-hyperlegible-next", TEXT], ["atkinson-hyperlegible-mono", CODE]),
  P("onest", "Onest", "neutral", "Modern and neutral, with friendly round dots.", ["onest", TEXT], ["geist-mono", CODE]),
  P("rethink", "Rethink", "neutral", "Clean and confident, tuned for product UI.", ["rethink-sans", TEXT], ["spline-sans-mono", CODE]),
  P("golos", "Golos", "neutral", "Plain and readable, made for interfaces.", ["golos-text", TEXT], ["jetbrains-mono", CODE]),

  // Friendly
  P("nunito", "Nunito", "friendly", "Soft, rounded ends. Warm without being childish.", ["nunito", TEXT], ["dm-mono", CODE]),
  P("outfit", "Outfit", "friendly", "Clean geometry for consumer apps.", ["outfit", TEXT], ["dm-mono", CODE]),
  P("jakarta", "Plus Jakarta", "friendly", "Polished and modern, with a slight tilt of personality.", ["plus-jakarta-sans", TEXT], ["jetbrains-mono", CODE]),
  P("rubik", "Rubik", "friendly", "Slightly rounded corners, sturdy and cheerful.", ["rubik", TEXT], ["fira-code", CODE]),
  P("lexend", "Lexend", "friendly", "Wide spacing that's easy to read fast.", ["lexend", TEXT], ["sometype-mono", CODE]),
  P("albert", "Albert", "friendly", "Scandinavian simplicity, slightly geometric.", ["albert-sans", TEXT], ["dm-mono", CODE]),

  // Editorial
  P("newsroom", "Newsreader", "editorial", "A newsroom serif for headlines and long reads.", ["source-sans-3", TEXT], ["source-code-pro", CODE], ["newsreader", [500, 600]]),
  P("fraunces", "Fraunces", "editorial", "A soft, wonky serif with personality, over a plain sans.", ["work-sans", TEXT], ["dm-mono", CODE], ["fraunces", [500, 600]]),
  P("literata", "Literata", "editorial", "A book face throughout, for reading-heavy products.", ["literata", TEXT], ["jetbrains-mono", CODE]),
  P("playfair", "Playfair", "editorial", "High-contrast headlines, magazine style.", ["source-sans-3", TEXT], ["source-code-pro", CODE], ["playfair-display", [600, 700]]),
  P("garamond", "Garamond", "editorial", "Classic book typography over a quirky grotesk.", ["karla", TEXT], ["fragment-mono", [400]], ["eb-garamond", [500, 600]]),
  P("dm-serif", "DM Serif", "editorial", "One family, two voices: a confident serif over a geometric sans.", ["dm-sans", TEXT], ["dm-mono", CODE], ["dm-serif-display", [400]]),
  P("gloock", "Gloock", "editorial", "Bold, warm serif headlines.", ["hanken-grotesk", TEXT], ["geist-mono", CODE], ["gloock", [400]]),
  P("young-serif", "Young Serif", "editorial", "A friendly old-style serif with a modern sans.", ["familjen-grotesk", TEXT], ["jetbrains-mono", CODE], ["young-serif", [400]]),
  P("source-serif", "Source Serif", "editorial", "Serif text throughout, for documents and long reads.", ["source-serif-4", TEXT], ["source-code-pro", CODE]),

  // Technical
  P("space", "Space", "technical", "Quirky, technical, a little retro-futurist.", ["space-grotesk", TEXT], ["space-mono", [400]]),
  P("martian", "Martian", "technical", "Monospace headlines for developer products.", ["ibm-plex-sans", TEXT], ["martian-mono", CODE], ["martian-mono", [500, 600]]),
  P("mona", "Mona", "technical", "Wide grotesks from GitHub, made for developer tools.", ["mona-sans", TEXT], ["jetbrains-mono", CODE], ["hubot-sans", [600, 700]]),
  P("chakra", "Chakra", "technical", "Angular and engineered, for hardware and data.", ["barlow", TEXT], ["azeret-mono", CODE], ["chakra-petch", [500, 600]]),
  P("schibsted", "Schibsted", "technical", "A newspaper grotesk built for interfaces, with a grotesk mono.", ["schibsted-grotesk", TEXT], ["spline-sans-mono", CODE]),
  P("terminal-mono", "JetBrains", "technical", "Monospace everywhere: the terminal as an interface.", ["jetbrains-mono", TEXT], ["jetbrains-mono", CODE]),

  // Expressive
  P("syne", "Syne", "expressive", "Wide, artsy display over a neutral body.", ["inter", TEXT], ["jetbrains-mono", CODE], ["syne", [600, 700]]),
  P("unbounded", "Unbounded", "expressive", "Big, round, extended headlines for bold launches.", ["onest", TEXT], ["azeret-mono", CODE], ["unbounded", [600, 700]]),
  P("bebas", "Bebas", "expressive", "Tall condensed caps for posters and sports.", ["barlow", TEXT], ["space-mono", [400]], ["bebas-neue", [400]]),
  P("shoulders", "Big Shoulders", "expressive", "Condensed display with industrial grit.", ["archivo", TEXT], ["chivo-mono", CODE], ["big-shoulders-display", [600, 700]]),
  P("anton", "Anton", "expressive", "Heavy, loud headlines over an even sans.", ["work-sans", TEXT], ["dm-mono", CODE], ["anton", [400]]),
  P("dela", "Dela Gothic", "expressive", "Chunky Japanese-inspired display. Unmistakable.", ["rethink-sans", TEXT], ["jetbrains-mono", CODE], ["dela-gothic-one", [400]]),
  P("clash", "Archivo Black", "expressive", "A heavy grotesk that commands a page.", ["archivo", TEXT], ["jetbrains-mono", CODE], ["archivo-black", [400]]),

  // Refined
  P("bodoni", "Bodoni", "luxury", "Fashion-house contrast with a geometric companion.", ["jost", TEXT], ["dm-mono", CODE], ["bodoni-moda", [500, 600]]),
  P("cormorant", "Cormorant", "luxury", "Elegant, airy serif for hospitality and beauty.", ["montserrat", TEXT], ["dm-mono", CODE], ["cormorant-garamond", [500, 600]]),
  P("cinzel", "Cinzel", "luxury", "Roman capitals, formal and ceremonial.", ["raleway", TEXT], ["dm-mono", CODE], ["cinzel", [500, 600]]),
  P("prata", "Prata", "luxury", "Didone elegance over a humanist sans.", ["mulish", TEXT], ["dm-mono", CODE], ["prata", [400]]),
  P("italiana", "Italiana", "luxury", "A thin classical display with fashion poise.", ["tenor-sans", [400]], ["dm-mono", CODE], ["italiana", [400]]),

  // Playful
  P("fredoka", "Fredoka", "playful", "Rounded and playful, for products people enjoy.", ["nunito", TEXT], ["dm-mono", CODE], ["fredoka", [600, 700]]),
  P("shrikhand", "Shrikhand", "playful", "Retro, bold and upbeat headlines.", ["dm-sans", TEXT], ["dm-mono", CODE], ["shrikhand", [400]]),
  P("bagel", "Bagel", "playful", "Bubbly and fat, for fun consumer brands.", ["rubik", TEXT], ["fira-code", CODE], ["bagel-fat-one", [400]]),
  P("caprasimo", "Caprasimo", "playful", "70s soft serif swagger.", ["albert-sans", TEXT], ["dm-mono", CODE], ["caprasimo", [400]]),
  P("pixel", "Pixel", "playful", "Pixel headlines for games and indie tools.", ["space-grotesk", TEXT], ["space-mono", [400]], ["silkscreen", [400]]),
  P("tilt", "Tilt", "playful", "Letters that tilt in perspective.", ["readex-pro", TEXT], ["dm-mono", CODE], ["tilt-warp", [400]]),
];

type FontInput = NonNullable<DesignConfig["type"]["display"]>;

/** The weights a role should use from what a face covers: the asked ones, or the nearest available. */
export function weightsFor(entry: FontEntry, wanted: number[]): number[] {
  // Systems use the 300 to 700 range; a face's extremes stay out of product type.
  const pool = entry.available.filter((w) => (FONT_WEIGHTS as readonly number[]).includes(w));
  const usable = pool.length ? pool : [400];
  const out = new Set<number>();
  for (const w of wanted) {
    const nearest = usable.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
    out.add(nearest);
  }
  return [...out].sort((a, b) => a - b).slice(0, 3);
}

function fontConfig(entry: FontEntry, weights: number[]): FontInput {
  const base = entry.kind === "mono" ? MONO_FALLBACK : entry.kind === "serif" ? SERIF_FALLBACK : SANS_FALLBACK;
  return {
    family: entry.family,
    fallback: [entry.google, ...base],
    weights: weightsFor(entry, weights) as FontInput["weights"],
    package: entry.package,
    license: entry.license,
  };
}

const getFont = (f: string) => {
  const e = FONTS[f];
  if (!e) throw new Error(`Unknown font "${f}". Pick one from the font catalog, for example ${PAIRINGS.slice(0, 3).map((p) => p.sans.font).join(", ")}.`);
  return e;
};

/** The `type` fonts for a pairing, ready to drop into a design config. */
export function pairingFonts(id: string): { sans: FontInput; mono: FontInput; display?: FontInput } {
  const p = PAIRINGS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown font pairing "${id}". Available: ${PAIRINGS.map((x) => x.id).join(", ")}`);
  return {
    sans: fontConfig(getFont(p.sans.font), p.sans.weights),
    mono: fontConfig(getFont(p.mono.font), p.mono.weights),
    ...(p.display ? { display: fontConfig(getFont(p.display.font), p.display.weights) } : {}),
  };
}

/** Default weights by role when a face is picked by hand. */
const ROLE_WEIGHTS = { body: TEXT, display: [600, 700], mono: CODE };

/**
 * The `type` fonts for faces picked by hand: any body face, any monospace, and
 * an optional display face. Weights come from what each face covers.
 */
export function customFonts(pick: { sans: string; mono: string; display?: string | null }): { sans: FontInput; mono: FontInput; display?: FontInput } {
  const sans = getFont(pick.sans);
  const mono = getFont(pick.mono);
  if (!sans.roles.includes("body")) throw new Error(`${sans.google} is a display face. Pick it for headlines, with a body face for text.`);
  if (!mono.roles.includes("mono")) throw new Error(`${mono.google} isn't a monospace face.`);
  const display = pick.display ? getFont(pick.display) : null;
  if (display && !display.roles.includes("display")) throw new Error(`${display.google} isn't made for headlines.`);
  const displayWeights = display && display.available.length === 1 ? display.available : ROLE_WEIGHTS.display;
  return {
    sans: fontConfig(sans, ROLE_WEIGHTS.body),
    mono: fontConfig(mono, ROLE_WEIGHTS.mono),
    ...(display && display.id !== sans.id ? { display: fontConfig(display, displayWeights) } : {}),
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

/** The catalog ids a config's fonts come from, whether a pairing or picked by hand. */
export function fontsOf(config: Pick<DesignConfig, "type">): { sans: string | null; mono: string | null; display: string | null } {
  const id = (f?: { family: string }) => (f ? (FONT_CATALOG.find((e) => e.family === f.family)?.id ?? null) : null);
  return { sans: id(config.type.sans), mono: id(config.type.mono), display: id(config.type.display) };
}

/** Find a catalog font by any family name a site might use ("Geist", "Geist Variable", "geist"). */
export function findFont(name: string): FontEntry | null {
  const n = name.trim().replace(/^["']|["']$/g, "").toLowerCase().replace(/\s+variable$/, "");
  return FONT_CATALOG.find((f) => f.google.toLowerCase() === n || f.id === n.replace(/\s+/g, "-")) ?? null;
}
