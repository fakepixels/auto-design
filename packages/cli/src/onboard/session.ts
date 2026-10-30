import {
  ConfigError,
  BuildError,
  FONTS,
  MOTION_PROFILES,
  PAIRINGS,
  SURFACES,
  TEXTURES,
  buildSystem,
  fontsOf,
  parseColor,
  specimenData,
  toHex,
  type DesignConfig,
  type SpecimenCopy,
  type SpecimenData,
  type Surface,
} from "@auto-design/core";
import {
  applyPatch,
  currentChoices,
  defaultCopy,
  describeChanges,
  lookPatch,
  patchFromSite,
  type DesignPatch,
  type Look,
  type ModelConfig,
  type Part,
  type Photo,
  type SiteMaterial,
} from "@auto-design/ai";
import { presets } from "@auto-design/presets";

/**
 * One onboarding session: the system being designed, the sample copy it's
 * shown on, the model (if any) and an undo history. The server is a thin HTTP
 * layer over this, so the flow can be tested without a browser.
 */

export interface HistoryEntry {
  label: string;
  changes: string[];
  config: DesignConfig;
}

/** A starting point made from what the person brought, shown next to the presets. */
export interface Generated {
  id: string;
  name: string;
  /** Where it came from, shown as a tag on its card. */
  tag: string;
  note: string;
  /** The history line when it's chosen. */
  label: string;
  config: DesignConfig;
}

export interface Session {
  product: { name: string; description: string; url: string };
  config: DesignConfig;
  preset: string;
  copy: SpecimenCopy;
  model: (ModelConfig & { label: string }) | null;
  site: SiteMaterial | null;
  /** The main colors of the images the person dropped, read in the browser. */
  imageColors: string[];
  generated: Generated[];
  /** What kind of product it is, and for a consumer app, its vibe. */
  kind: string | null;
  vibe: string | null;
  history: HistoryEntry[];
  /** How the reference looks: the site's, measured in a browser, else the images', measured in pixels. */
  look: Look | null;
  /** The images' look, kept apart so a site read later doesn't lose it. */
  imageLook: Look | null;
  /** The site's first screen as a browser drew it, for the model. */
  siteShot: Part | null;
  /** Photos the system uses, in order: the first leads the landing page, the next fill its collection. */
  photos: Photo[];
  /** The last photo search: its words and what came back. */
  photoSearch: { q: string; results: Photo[]; error: string | null; auto: boolean } | null;
  /** Photos the person added from their own files, by id. Never sent anywhere; published into the repo. */
  ownPhotos: Map<string, { mediaType: string; data: Buffer }>;
  /** The person chose the photos themselves, so automatic searches no longer replace them. */
  photosPicked: boolean;
}

export const TEXTURE_INFO: Record<(typeof TEXTURES)[number], { name: string; note: string }> = {
  minimal: { name: "Minimal", note: "Hairline borders and the lightest shadow. Structure comes from space." },
  editorial: { name: "Editorial", note: "Typography leads. Few boxes: no borders, no shadows." },
  glass: { name: "Glass", note: "Frosted chrome over a tinted backdrop; content stays solid." },
  tactile: { name: "Tactile", note: "Soft raised surfaces and buttons that press down." },
  technical: { name: "Technical", note: "Crisp borders, monospace labels, dense and exact." },
};

export const MOTION_INFO: Record<(typeof MOTION_PROFILES)[number], { name: string; note: string }> = {
  still: { name: "Still", note: "Fades only. Nothing moves that doesn't have to." },
  subtle: { name: "Subtle", note: "Quick fades with a hint of scale. Felt more than seen." },
  expressive: { name: "Expressive", note: "Springier entrances that travel a little further." },
};

export const SURFACE_INFO: Record<Surface, { name: string; note: string }> = {
  "web-app": { name: "Web app", note: "Dashboards, settings, tables and forms." },
  marketing: { name: "Marketing site", note: "Landing pages, pricing, social images." },
  code: { name: "Code blocks", note: "Docs and snippets in your syntax colors." },
  chat: { name: "In-app chat", note: "Messages, tool calls and approvals for your agent." },
  "mcp-apps": { name: "Inside ChatGPT and Claude", note: "Apps that render in a chat host's window." },
  messaging: { name: "iMessage and SMS", note: "Image cards, link previews and voice rules for text." },
};

export const slug = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").slice(0, 32).replace(/^-+|-+$/g, "").replace(/^(\d)/, "s$1") || "my-product";

/** A preset, renamed for the person's product. */
export function presetFor(name: string, product: Session["product"]): DesignConfig {
  const base = presets[name] ?? presets.quiet!;
  const clone = structuredClone(base);
  const productName = product.name.trim() || "My product";
  clone.name = slug(productName).length >= 2 ? slug(productName) : `${slug(productName)}-ds`;
  clone.displayName = productName;
  clone.description = product.description.trim() || clone.description;
  return clone;
}

export function createSession(product: Partial<Session["product"]> = {}): Session {
  const p = { name: product.name ?? "", description: product.description ?? "", url: product.url ?? "" };
  return {
    product: p,
    config: presetFor("quiet", p),
    preset: "quiet",
    copy: defaultCopy(p.name || "Northwind", p.description),
    model: null,
    site: null,
    imageColors: [],
    generated: [],
    kind: null,
    vibe: null,
    history: [],
    look: null,
    imageLook: null,
    siteShot: null,
    photos: [],
    photoSearch: null,
    ownPhotos: new Map(),
    photosPicked: false,
  };
}

/** The reference's look: the site's when one was read in a browser, else the images'. */
export function referenceLook(session: Session): Look | null {
  return session.site?.look ?? session.imageLook ?? null;
}

/**
 * Photos in the order a page uses them: a wide one first when the first screen is full-bleed or centered,
 * a tall one when it's split or editorial; the rest fill the collection.
 */
export function photosForPage(photos: Photo[], hero: string): Photo[] {
  if (photos.length < 2) return photos;
  const ratio = (p: Photo) => (p.width && p.height ? p.width / p.height : 1);
  const wide = hero === "full-bleed" || hero === "centered";
  const lead = [...photos].sort((a, b) => (wide ? ratio(b) - ratio(a) : ratio(a) - ratio(b)))[0]!;
  return [lead, ...photos.filter((p) => p !== lead)];
}

export function errorText(err: unknown): string {
  if (err instanceof ConfigError) return err.issues.map((i) => i.message).join(" ");
  if (err instanceof BuildError) return err.message.split("\n")[0]!;
  return err instanceof Error ? err.message : String(err);
}

/** Build and describe a config, or say why it doesn't build. */
export function specimen(config: DesignConfig): SpecimenData {
  return specimenData(buildSystem(config));
}

/** Commit a new config, keeping what came before for undo. */
export function commit(session: Session, next: DesignConfig, label: string): string[] {
  buildSystem(next);
  const changes = describeChanges(session.config, next);
  // Choosing what's already chosen changes nothing, so it leaves nothing to undo.
  if (!changes.length && JSON.stringify(session.config) === JSON.stringify(next)) return changes;
  session.history.push({ label, changes, config: session.config });
  if (session.history.length > 50) session.history.shift();
  session.config = next;
  return changes;
}

export function undo(session: Session): HistoryEntry | null {
  const last = session.history.pop();
  if (!last) return null;
  session.config = last.config;
  return last;
}

export function setProduct(session: Session, product: Partial<Session["product"]>) {
  session.product = { ...session.product, ...product };
  session.config = {
    ...session.config,
    name: presetFor(session.preset, session.product).name,
    displayName: session.product.name.trim() || session.config.displayName,
    description: session.product.description.trim() || session.config.description,
  };
  session.copy = { ...defaultCopy(session.product.name || "Northwind", session.product.description), ...pickModelCopy(session.copy, session.product.name) };
}

/** Keep model-written copy only if it was written for this product name. */
function pickModelCopy(copy: SpecimenCopy, name: string): Partial<SpecimenCopy> {
  return copy.product === name && (copy as SpecimenCopy & { byModel?: boolean }).byModel ? copy : {};
}

export function startFrom(session: Session, preset: string) {
  const made = session.generated.find((g) => g.id === preset);
  if (made) {
    const next = structuredClone(made.config);
    next.surfaces = session.config.surfaces?.length ? session.config.surfaces : next.surfaces;
    commit(session, next, made.label);
    session.preset = preset;
    return;
  }
  if (!presets[preset]) throw new Error(`Unknown preset "${preset}"`);
  const next = presetFor(preset, session.product);
  next.surfaces = session.config.surfaces?.length ? session.config.surfaces : next.surfaces;
  commit(session, next, `Started from ${presets[preset]!.displayName}`);
  session.preset = preset;
}

/** One line under each starting point; the preset's full description goes in its DESIGN.md. */
const PRESET_NOTES: Record<string, string> = {
  quiet: "Ink, hairlines, quiet depth",
  editorial: "Serif voice on warm paper",
  glass: "Frosted chrome over soft light",
  terminal: "Dark, exact, monospace",
  tactile: "Soft, raised, warm",
};

export type VariantField = "preset" | "texture" | "pairing" | "radius" | "density" | "motion" | "neutral" | "defaultMode" | "brand" | "kind" | "vibe";

/** What a product is sets its starting direction and the object its previews show. */
export const KINDS: { id: string; name: string; note: string; scene: string }[] = [
  { id: "consumer", name: "Consumer app", note: "Something people choose to spend time in. Beautiful first.", scene: "moment" },
  { id: "saas", name: "SaaS", note: "Software teams use all day. Sleek, clean and exact.", scene: "decision" },
  { id: "ecommerce", name: "E-commerce", note: "Products, a bag and a checkout that converts.", scene: "shop" },
  { id: "agent", name: "AI agent", note: "Conversations, tool calls and approvals.", scene: "agent" },
  { id: "devtool", name: "Developer tool", note: "Docs, terminals and code. Dense and precise.", scene: "decision" },
];

export const VIBES: { id: string; name: string; note: string }[] = [
  { id: "luxury", name: "Luxury", note: "Serif, near-black and gold. Quiet and expensive." },
  { id: "dreamy", name: "Dreamy", note: "Soft glass, pastel light and round corners." },
  { id: "scifi", name: "Sci-fi", note: "Dark, sharp and lit like a cockpit." },
  { id: "playful", name: "Playful", note: "Round, bouncy and bright. Cute is welcome." },
];

interface Direction { patch: Partial<DesignPatch>; brand: string; surfaces?: Surface[] }

const DIRECTIONS: Record<string, Direction> = {
  saas: { patch: { texture: "minimal", pairing: "geist", radius: 8, density: "compact", motion: "subtle", neutral: "cool", defaultMode: "light", energy: 0.3, warmth: 0.3, novelty: 0.2, imagery: "supporting", hero: "split", grid: "cards", labels: "sentence", display: "standard", logo: "mark" }, brand: "oklch(0.55 0.21 262)" },
  ecommerce: { patch: { texture: "minimal", pairing: "jakarta", radius: 12, density: "comfortable", motion: "subtle", neutral: "warm", defaultMode: "light", energy: 0.5, warmth: 0.6, novelty: 0.4, imagery: "leading", hero: "split", grid: "open", labels: "sentence", display: "standard", logo: "mark" }, brand: "oklch(0.67 0.19 42)", surfaces: ["web-app", "marketing"] },
  agent: { patch: { texture: "glass", pairing: "inter", radius: 12, density: "comfortable", motion: "subtle", neutral: "cool", defaultMode: "light", energy: 0.4, warmth: 0.4, novelty: 0.4, imagery: "none", hero: "split", grid: "open", labels: "sentence", display: "standard", logo: "mark" }, brand: "oklch(0.55 0.21 292)", surfaces: ["web-app", "chat"] },
  devtool: { patch: { texture: "technical", pairing: "plex", radius: 4, density: "compact", motion: "still", neutral: "cool", defaultMode: "dark", energy: 0.2, warmth: 0.2, novelty: 0.3, imagery: "none", hero: "type", grid: "open", labels: "sentence", display: "standard", logo: "mark" }, brand: "oklch(0.82 0.13 200)", surfaces: ["web-app", "code"] },
  "consumer:luxury": { patch: { texture: "editorial", pairing: "bodoni", radius: 0, density: "comfortable", motion: "still", neutral: "warm", defaultMode: "dark", energy: 0.15, warmth: 0.6, novelty: 0.5, imagery: "leading", hero: "full-bleed", grid: "open", labels: "uppercase", display: "dramatic", logo: "wordmark" }, brand: "oklch(0.78 0.09 82)" },
  "consumer:dreamy": { patch: { texture: "glass", pairing: "fraunces", radius: 16, density: "comfortable", motion: "expressive", neutral: "cool", defaultMode: "light", energy: 0.6, warmth: 0.6, novelty: 0.6, imagery: "leading", hero: "centered", grid: "editorial", labels: "sentence", display: "dramatic", logo: "mark" }, brand: "oklch(0.7 0.13 320)" },
  "consumer:scifi": { patch: { texture: "technical", pairing: "chakra", radius: 2, density: "comfortable", motion: "expressive", neutral: "cool", defaultMode: "dark", energy: 0.8, warmth: 0.2, novelty: 0.8, imagery: "leading", hero: "full-bleed", grid: "open", labels: "uppercase", display: "dramatic", logo: "mark" }, brand: "oklch(0.84 0.14 195)" },
  "consumer:playful": { patch: { texture: "tactile", pairing: "fredoka", radius: 16, density: "comfortable", motion: "expressive", neutral: "warm", defaultMode: "light", energy: 0.85, warmth: 0.85, novelty: 0.8, imagery: "supporting", hero: "split", grid: "cards", labels: "sentence", display: "dramatic", logo: "mark" }, brand: "oklch(0.72 0.16 355)" },
};
/** Without a kind, a bolder take still leans expressive. */
const BOLD: Direction = { patch: { texture: "glass", pairing: "bricolage", radius: 16, density: "comfortable", motion: "expressive", energy: 0.75, novelty: 0.75, hero: "editorial", grid: "editorial", display: "dramatic" }, brand: "oklch(0.62 0.2 300)" };

function directionFor(kind: string | null, vibe: string | null): Direction | null {
  if (!kind) return null;
  return DIRECTIONS[kind === "consumer" ? `consumer:${vibe ?? "dreamy"}` : kind] ?? null;
}

/** A brand color nobody chose: a preset's or a direction's own. Those give way to a direction's color. */
function stockBrand(brand: string | undefined): boolean {
  if (!brand) return true;
  return Object.values(presets).some((p) => p.color.brand === brand) || Object.values(DIRECTIONS).some((d) => d.brand === brand);
}

function withDirection(config: DesignConfig, dir: Direction): DesignConfig {
  const patch: Partial<DesignPatch> = { ...dir.patch };
  if (stockBrand(config.color.brand)) patch.brand = dir.brand;
  const next = applyPatch(config, patch);
  if (dir.surfaces) next.surfaces = [...new Set([...(config.surfaces ?? []), ...dir.surfaces])];
  return next;
}

export function kindLabel(kind: string | null, vibe: string | null): string {
  const k = KINDS.find((x) => x.id === kind);
  if (!k) return "";
  const v = kind === "consumer" ? VIBES.find((x) => x.id === vibe) : undefined;
  return v ? `${k.name}, ${v.name.toLowerCase()}` : k.name;
}

/** Choose what kind of product it is: the system takes that kind's direction. */
export function setKind(session: Session, kind: string, vibe?: string | null) {
  if (!KINDS.some((k) => k.id === kind)) throw new Error(`Unknown kind "${kind}"`);
  session.kind = kind;
  session.vibe = kind === "consumer" ? (vibe && VIBES.some((v) => v.id === vibe) ? vibe : session.vibe ?? "dreamy") : null;
  commit(session, withDirection(session.config, directionFor(session.kind, session.vibe)!), `Kind: ${kindLabel(session.kind, session.vibe)}`);
  // The kind is a starting point of its own, shown with the ones made from material.
  const label = kindLabel(session.kind, session.vibe);
  const c = session.config;
  const face = FONTS[fontsOf(c).sans ?? ""]?.google;
  const pairing = PAIRINGS.find((p) => p.id === currentChoices(c).pairing);
  const faces = pairing ? [pairing.display?.font, pairing.sans.font].filter(Boolean).map((f) => FONTS[f!]!.google)[0] : face;
  const made: Generated = { id: "gen:kind", name: label, tag: "From the kind you picked", note: [faces, `${TEXTURE_INFO[c.texture].name.toLowerCase()} surfaces`, `${c.shape?.radius ?? 8}px corners`].filter(Boolean).join(", "), label: `Started from ${label.toLowerCase()}`, config: structuredClone(c) };
  session.generated = [...session.generated.filter((g) => g.id !== "gen:kind"), made];
  session.preset = "gen:kind";
}

/** The description with the kind folded in, for the model. */
export function productBrief(session: Session): string {
  const label = kindLabel(session.kind, session.vibe);
  return [session.product.description.trim(), label && `It's a ${label.toLowerCase()} product.`].filter(Boolean).join(" ");
}

export interface Variant {
  value: string | number;
  name: string;
  note: string;
  /** A short tag on the card, for options made from the person's own material. */
  tag?: string;
  /** What choosing it changes, when that's more than the field itself. */
  patch?: Partial<DesignPatch>;
  /** The object its preview shows, when it isn't the gallery's own. */
  scene?: string;
  specimen?: SpecimenData;
  error?: string;
}

/** Ready palettes for the Color step: a brand color and the grays that suit it. */
export const PALETTES: { id: string; name: string; brand: string; neutral: "cool" | "neutral" | "warm" }[] = [
  { id: "ink", name: "Ink", brand: "oklch(0.21 0.006 265)", neutral: "cool" },
  { id: "cobalt", name: "Cobalt", brand: "oklch(0.55 0.21 262)", neutral: "cool" },
  { id: "violet", name: "Violet", brand: "oklch(0.55 0.21 292)", neutral: "cool" },
  { id: "ocean", name: "Ocean", brand: "oklch(0.58 0.12 228)", neutral: "cool" },
  { id: "lagoon", name: "Lagoon", brand: "oklch(0.64 0.11 190)", neutral: "cool" },
  { id: "forest", name: "Forest", brand: "oklch(0.46 0.09 158)", neutral: "warm" },
  { id: "moss", name: "Moss", brand: "oklch(0.62 0.14 130)", neutral: "warm" },
  { id: "saffron", name: "Saffron", brand: "oklch(0.8 0.15 82)", neutral: "warm" },
  { id: "ember", name: "Ember", brand: "oklch(0.67 0.19 42)", neutral: "warm" },
  { id: "rose", name: "Rose", brand: "oklch(0.6 0.2 12)", neutral: "neutral" },
  { id: "plum", name: "Plum", brand: "oklch(0.48 0.15 330)", neutral: "neutral" },
];

const TEXTURE_PRESET: Record<(typeof TEXTURES)[number], string> = { minimal: "quiet", editorial: "editorial", glass: "glass", technical: "terminal", tactile: "tactile" };

/** The art direction in a few words, for a starting point's card. */
export function artNote(config: DesignConfig): string {
  const a = { imagery: "none", hero: "type", grid: "cards", labels: "sentence", display: "standard", logo: "mark", ...config.art };
  const hero: Record<string, string> = { "full-bleed": "full-bleed photo", split: "words beside a picture", centered: "centered", editorial: "magazine column", type: "headline first" };
  const parts = [a.imagery === "leading" ? "photos lead" : a.imagery === "none" ? "type leads" : "", hero[a.hero] ?? "", a.logo === "wordmark" ? "wordmark" : "", a.labels === "uppercase" ? "uppercase labels" : "", a.display === "dramatic" ? "big headlines" : ""];
  return parts.filter(Boolean).slice(0, 3).join(", ");
}

/** A patch without its art direction, so a starting point can keep the reference's colors and type but compose differently. */
function withoutArt(patch: Partial<DesignPatch>): Partial<DesignPatch> {
  const { imagery: _i, hero: _h, grid: _g, labels: _l, display: _d, logo: _o, ...rest } = patch;
  return rest;
}

/**
 * Starting points made from the person's own material: their site, the images they dropped, or both.
 * They differ in how pages are composed, not only in shades of one color: one stays as close to the
 * reference as the system allows, one lets photography lead, one lets type lead, and one takes a bolder
 * risk. Built without a model, so they appear the moment the material is read; a model's pick is kept
 * alongside when there is one.
 */
export function generateOptions(session: Session, imageColors: string[] = session.imageColors): Generated[] {
  session.imageColors = imageColors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6);
  const dir = directionFor(session.kind, session.vibe);
  const texture = (dir?.patch.texture as (typeof TEXTURES)[number] | undefined) ?? heuristicTexture(session.product.description);
  const other: (typeof TEXTURES)[number] = texture === "minimal" ? "glass" : "minimal";
  // The kind's direction under the material, so a store reads as a store even in its site's colors.
  const base = (t = texture) => {
    const preset = presetFor(TEXTURE_PRESET[t]!, session.product);
    if (!dir) return preset;
    const { brand: _brand, ...rest } = dir.patch;
    return applyPatch(preset, { ...rest, texture: t });
  };
  const made: Generated[] = [];
  const add = (g: Omit<Generated, "config" | "note"> & { note?: string }, make: () => DesignConfig) => {
    try {
      const config = make();
      config.surfaces = session.config.surfaces?.length ? session.config.surfaces : config.surfaces;
      buildSystem(config);
      made.push({ ...g, note: g.note ?? artNote(config), config });
    } catch {
      /* an option that doesn't build isn't offered */
    }
  };
  const site = session.site;
  const look = referenceLook(session);
  const [first, second] = session.imageColors;
  // The reference as the system can hold it: the site's colors, type and corners, and how it's composed.
  const ref: Partial<DesignPatch> = site ? patchFromSite(site) : look ? lookPatch(look) : {};
  if (!ref.brand && first) ref.brand = first;
  const from = site ? "site" : "images";
  const tag = site ? "From your site" : "From your images";
  const hasMaterial = !!site || session.imageColors.length > 0 || !!look;
  if (!hasMaterial) {
    session.generated = session.generated.filter((g) => g.id === "gen:model" || g.id === "gen:kind");
    return session.generated;
  }
  const refHero = ref.hero ?? "type";
  const colorsAndType = withoutArt(ref);

  add({ id: "gen:ref", name: `Close to your ${from}`, tag, label: `Started close to your ${from}`, note: look ? look.facts.slice(0, 3).join(", ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) : site ? siteNote(site) : undefined }, () => applyPatch(base(), ref));
  add(
    { id: "gen:photo", name: "Photography leads", tag, label: "Started from photography leading" },
    // A photo across the page when the reference isn't one already; otherwise a centered headline over a wide photo, so it never repeats the split below.
    () => applyPatch(base(), { ...colorsAndType, imagery: "leading", hero: refHero === "full-bleed" ? "centered" : "full-bleed", grid: "open", display: "dramatic", labels: ref.labels ?? "uppercase", logo: ref.logo ?? "wordmark" }),
  );
  // Type leads: no photography, a big headline and a collection set like a magazine's contents. The
  // reference's wordmark and label case stay: they're its identity, not its composition.
  const serifDisplay = ref.fonts?.display ?? null;
  add(
    { id: "gen:type", name: "Type leads", tag, label: "Started from type leading" },
    () => applyPatch(base("editorial"), { ...colorsAndType, ...(serifDisplay ? {} : { pairing: "instrument" }), texture: "editorial", imagery: "none", hero: "type", grid: "editorial", display: "dramatic", labels: ref.labels ?? "sentence", logo: ref.logo ?? "mark" }),
  );
  // A bolder take: the material's most characterful color in the kind's full direction, the risk the reference doesn't take.
  const signature = mostVivid([...(site?.colors.map((c) => c.hex) ?? []), ...session.imageColors, ...(look?.uiColors ?? [])]);
  if (signature) {
    const bold = dir ?? BOLD;
    const mood = (session.kind === "consumer" ? VIBES.find((v) => v.id === session.vibe)?.name ?? "bolder" : "bolder").toLowerCase();
    add(
      { id: "gen:bold", name: `Your ${from}, ${mood}`, tag, label: `Started from your ${from}, ${mood}` },
      () => applyPatch(presetFor(TEXTURE_PRESET[(bold.patch.texture as (typeof TEXTURES)[number]) ?? "glass"]!, session.product), { ...bold.patch, brand: signature, imagery: "supporting", hero: "split", grid: "editorial", display: "dramatic" }),
    );
  }
  // The store's classic: words beside a picture over boxed products, for when the reference does something else.
  if (refHero !== "split") {
    add(
      { id: "gen:split", name: "Words beside a picture", tag, label: "Started from words beside a picture" },
      () => applyPatch(base(), { ...colorsAndType, imagery: ref.imagery && ref.imagery !== "none" ? ref.imagery : "supporting", hero: "split", grid: "cards", labels: "sentence", display: "standard", logo: ref.logo ?? "mark" }),
    );
  }
  if (site && ref.brand && !look) {
    const flip = site.dark ? "light" : "dark";
    add({ id: "gen:site-flip", name: site.dark ? "Your site, light" : "Your site, dark", tag, note: `The same colors and type, ${flip} first`, label: `Started from your site, ${flip}` }, () => applyPatch(base(), { ...ref, defaultMode: flip }));
  }
  if (second) {
    add({ id: "gen:images-2", name: "Your second color", tag: "From your images", note: `${second} on ${TEXTURE_INFO[other].name.toLowerCase()} surfaces`, label: "Started from your second color" }, () => applyPatch(base(other), { ...colorsAndType, brand: second }));
  }
  // The kind's own starting point takes the reference's colors too: a stock color beside the reference reads as someone else's brand.
  const kindOption = session.generated.find((g) => g.id === "gen:kind");
  if (kindOption && ref.brand) {
    try {
      const config = applyPatch(kindOption.config, { brand: ref.brand, ...(ref.neutral ? { neutral: ref.neutral } : {}) });
      buildSystem(config);
      kindOption.config = config;
    } catch {
      /* keeps the kind's own color */
    }
  }
  session.generated = [...made.slice(0, 4), ...session.generated.filter((g) => g.id === "gen:model" || g.id === "gen:kind")];
  return session.generated;
}

/** Keep a model's suggestion as one more starting point. */
export function addModelPick(session: Session, config: DesignConfig, reason: string) {
  const pick: Generated = { id: "gen:model", name: "The model's pick", tag: "Suggested by the model", note: reason, label: "Started from the model's pick", config };
  session.generated = [...session.generated.filter((g) => g.id !== "gen:model"), pick];
}

/** A nearby take on a palette color, the same for the same seed: hue, lightness and strength nudged. */
function shuffled(brand: string, seed: number, salt: string): string {
  let x = Math.abs(Math.floor(seed)) + [...salt].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
  const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const c = parseColor(brand);
  if (c.c < 0.02) return brand;
  const l = Math.min(0.82, Math.max(0.2, c.l + (rand() - 0.5) * 0.12));
  const chroma = Math.max(0.04, c.c * (0.8 + rand() * 0.35));
  const h = ((c.h || 0) + (rand() - 0.5) * 36 + 360) % 360;
  return `oklch(${l.toFixed(3)} ${chroma.toFixed(3)} ${h.toFixed(1)})`;
}

/** The strongest color in a list: the one that says the most about a brand. */
function mostVivid(colors: string[]): string | null {
  let best: string | null = null;
  let score = -1;
  for (const c of colors.slice(0, 8)) {
    try {
      const o = parseColor(c);
      // Strong color first; very dark and very light colors read as gray on screen.
      const s = o.c * (o.l < 0.25 || o.l > 0.92 ? 0.3 : 1);
      if (s > score) { score = s; best = c; }
    } catch {
      /* skip what doesn't parse */
    }
  }
  return score > 0.04 ? best : null;
}

function siteNote(site: SiteMaterial): string {
  const font = site.fonts[0]?.split(",")[0]?.replace(/["']/g, "").trim();
  return [site.colors[0]?.hex, font, site.radius !== null ? `${site.radius}px corners` : "", site.dark ? "dark first" : ""].filter(Boolean).join(", ") || "What your site shows";
}

/** The options for a taste question, each drawn on the person's own system. */
export function variants(session: Session, field: VariantField, opts: { mood?: string; seed?: number } = {}): Variant[] {
  const list: { value: string | number; name: string; note: string; tag?: string; scene?: string; patch?: Partial<DesignPatch>; config: () => DesignConfig }[] = [];
  const with_ = (patch: Partial<DesignPatch>) => () => applyPatch(session.config, patch);
  switch (field) {
    case "preset":
      for (const g of session.generated) list.push({ value: g.id, name: g.name, note: g.note, tag: g.tag, config: () => g.config });
      for (const [id, p] of Object.entries(presets)) {
        list.push({ value: id, name: p.displayName, note: PRESET_NOTES[id] ?? p.description ?? "", config: () => presetFor(id, session.product) });
      }
      break;
    case "texture":
      for (const t of TEXTURES) list.push({ value: t, ...TEXTURE_INFO[t], config: with_({ texture: t }) });
      break;
    case "pairing":
      for (const p of PAIRINGS) {
        if (opts.mood && p.mood !== opts.mood) continue;
        const faces = [p.display?.font, p.sans.font].filter(Boolean).map((f) => FONTS[f!]!.google);
        list.push({ value: p.id, name: faces.join(" + "), note: p.note, config: with_({ pairing: p.id }) });
      }
      break;
    case "radius":
      for (const r of [0, 4, 8, 12, 16]) list.push({ value: r, name: r === 0 ? "Square" : `${r}px`, note: radiusNote(r), config: with_({ radius: r }) });
      break;
    case "density":
      list.push({ value: "compact", name: "Compact", note: "32px controls. More on screen, for tools used all day.", config: with_({ density: "compact" }) });
      list.push({ value: "comfortable", name: "Comfortable", note: "36px controls and more air. Easier to scan and tap.", config: with_({ density: "comfortable" }) });
      break;
    case "motion":
      for (const m of MOTION_PROFILES) list.push({ value: m, ...MOTION_INFO[m], config: with_({ motion: m }) });
      break;
    case "neutral":
      list.push({ value: "cool", name: "Cool", note: "A hint of blue in every gray.", config: with_({ neutral: "cool" }) });
      list.push({ value: "neutral", name: "Neutral", note: "True grays.", config: with_({ neutral: "neutral" }) });
      list.push({ value: "warm", name: "Warm", note: "A hint of paper in every gray.", config: with_({ neutral: "warm" }) });
      break;
    case "defaultMode":
      list.push({ value: "light", name: "Light first", note: "Loads light; dark mode is a toggle away.", config: with_({ defaultMode: "light" }) });
      list.push({ value: "dark", name: "Dark first", note: "Loads dark; light mode is opt-in.", config: with_({ defaultMode: "dark" }) });
      break;
    case "kind":
      for (const k of KINDS) {
        list.push({ value: k.id, name: k.name, note: k.note, scene: k.scene, config: () => withDirection(session.config, directionFor(k.id, k.id === "consumer" ? session.vibe ?? "dreamy" : null)!) });
      }
      break;
    case "vibe":
      for (const v of VIBES) list.push({ value: v.id, name: v.name, note: v.note, scene: "moment", config: () => withDirection(session.config, directionFor("consumer", v.id)!) });
      break;
    case "brand": {
      // The current color first, then colors from the person's material, then ready palettes.
      const current = session.config.color.brand;
      const seen = new Set<string>();
      const hexOf = (c: string) => { try { return toHex(parseColor(c)); } catch { return c; } };
      const push = (value: string, name: string, note: string, patch: Partial<DesignPatch>, tag?: string) => {
        const hex = hexOf(patch.brand ?? current ?? "");
        if (seen.has(hex)) return;
        seen.add(hex);
        list.push({ value, name, note, tag, patch, config: with_(patch) });
      };
      if (current) push("current", "Current", hexOf(current), { brand: current });
      for (const c of session.site?.colors.slice(0, 2) ?? []) push(`site:${c.hex}`, "Your site", c.hex, { brand: c.hex }, "From your site");
      for (const c of session.imageColors.slice(0, 2)) push(`image:${c}`, "Your image", c, { brand: c }, "From your images");
      for (const p of PALETTES) {
        const brand = opts.seed === undefined ? p.brand : shuffled(p.brand, opts.seed, p.id);
        push(opts.seed === undefined ? p.id : `${p.id}:${opts.seed}`, p.name, hexOf(brand), { brand, neutral: p.neutral });
      }
      break;
    }
  }
  return list.map((o) => {
    const extra = { ...(o.tag ? { tag: o.tag } : {}), ...(o.scene ? { scene: o.scene } : {}), ...(o.patch ? { patch: o.patch } : {}) };
    try {
      return { value: o.value, name: o.name, note: o.note, ...extra, specimen: specimen(o.config()) };
    } catch (err) {
      return { value: o.value, name: o.name, note: o.note, ...extra, error: errorText(err) };
    }
  });
}

function radiusNote(r: number) {
  if (r === 0) return "Sharp corners everywhere. Precise, a little severe.";
  if (r <= 4) return "Barely rounded. Serious and editorial.";
  if (r <= 8) return "The safe middle. Works almost anywhere.";
  if (r <= 12) return "Soft and friendly without being bubbly.";
  return "Round and tactile. Feels like a consumer app.";
}

/** Apply the site's hints without a model. */
export function siteSuggestion(session: Session, material: SiteMaterial) {
  session.site = material;
  const patch = patchFromSite(material);
  return { patch, preview: specimen(applyPatch(session.config, patch)), changes: describeChanges(session.config, applyPatch(session.config, patch)) };
}

/** A guess from the description alone, for people without a model key. */
export function heuristicTexture(description: string): (typeof TEXTURES)[number] {
  const t = description.toLowerCase();
  if (/developer|api\b|infra|cli\b|devops|database|observab|terminal|sdk/.test(t)) return "technical";
  if (/financ|bank|legal|law\b|wealth|insur|luxury|journal|publish|advis/.test(t)) return "editorial";
  if (/community|social|friends|club|kids|learn|game|creator|fitness/.test(t)) return "tactile";
  if (/companion|assistant|mobile|consumer|wellness|travel|music|photo/.test(t)) return "glass";
  return "minimal";
}

export function setSurfaces(session: Session, surfaces: string[]) {
  const valid = surfaces.filter((s): s is Surface => (SURFACES as readonly string[]).includes(s));
  if (!valid.length) throw new Error("Choose at least one surface.");
  const next = { ...session.config, surfaces: valid };
  commit(session, next, "Changed surfaces");
}

export function choices(session: Session) {
  return currentChoices(session.config);
}
