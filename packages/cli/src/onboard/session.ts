import {
  ConfigError,
  BuildError,
  FONTS,
  MOTION_PROFILES,
  PAIRINGS,
  SURFACES,
  TEXTURES,
  buildSystem,
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
  patchFromSite,
  type DesignPatch,
  type ModelConfig,
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
  history: HistoryEntry[];
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
    history: [],
  };
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

export type VariantField = "preset" | "texture" | "pairing" | "radius" | "density" | "motion" | "neutral" | "defaultMode" | "brand";

export interface Variant {
  value: string | number;
  name: string;
  note: string;
  /** A short tag on the card, for options made from the person's own material. */
  tag?: string;
  /** What choosing it changes, when that's more than the field itself. */
  patch?: Partial<DesignPatch>;
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

/**
 * Starting points made from the person's own material: their site, the images
 * they dropped, or both. Built without a model, so they appear the moment the
 * material is read; a model's pick is kept alongside when there is one.
 */
export function generateOptions(session: Session, imageColors: string[] = session.imageColors): Generated[] {
  session.imageColors = imageColors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6);
  const texture = heuristicTexture(session.product.description);
  const other: (typeof TEXTURES)[number] = texture === "minimal" ? "glass" : "minimal";
  const base = (t = texture) => presetFor(TEXTURE_PRESET[t]!, session.product);
  const made: Generated[] = [];
  const add = (g: Omit<Generated, "config">, make: () => DesignConfig) => {
    try {
      const config = make();
      config.surfaces = session.config.surfaces?.length ? session.config.surfaces : config.surfaces;
      buildSystem(config);
      made.push({ ...g, config });
    } catch {
      /* an option that doesn't build isn't offered */
    }
  };
  const site = session.site;
  const sitePatch = site ? patchFromSite(site) : {};
  const [first, second] = session.imageColors;
  // In order of how much they say about the person; the first three are shown.
  if (site && Object.keys(sitePatch).length) {
    add({ id: "gen:site", name: "Your site", tag: "From your site", note: siteNote(site), label: "Started from your site" }, () => applyPatch(base(), sitePatch));
  }
  if (first) {
    add({ id: "gen:images", name: "Your images", tag: "From your images", note: `${first} on ${TEXTURE_INFO[texture].name.toLowerCase()} surfaces`, label: "Started from your images" }, () => applyPatch(base(), { brand: first }));
  }
  if (site && sitePatch.brand) {
    const flip = site.dark ? "light" : "dark";
    add({ id: "gen:site-flip", name: site.dark ? "Your site, light" : "Your site, dark", tag: "From your site", note: `The same colors and type, ${flip} first`, label: `Started from your site, ${flip}` }, () => applyPatch(base(), { ...sitePatch, defaultMode: flip }));
  }
  if (second) {
    add({ id: "gen:images-2", name: "Your second color", tag: "From your images", note: `${second} on ${TEXTURE_INFO[other].name.toLowerCase()} surfaces`, label: "Started from your second color" }, () => applyPatch(base(other), { brand: second }));
  }
  session.generated = [...made.slice(0, 3), ...session.generated.filter((g) => g.id === "gen:model")];
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

function siteNote(site: SiteMaterial): string {
  const font = site.fonts[0]?.split(",")[0]?.replace(/["']/g, "").trim();
  return [site.colors[0]?.hex, font, site.radius !== null ? `${site.radius}px corners` : "", site.dark ? "dark first" : ""].filter(Boolean).join(", ") || "What your site shows";
}

/** The options for a taste question, each drawn on the person's own system. */
export function variants(session: Session, field: VariantField, opts: { mood?: string; seed?: number } = {}): Variant[] {
  const list: { value: string | number; name: string; note: string; tag?: string; patch?: Partial<DesignPatch>; config: () => DesignConfig }[] = [];
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
    const extra = { ...(o.tag ? { tag: o.tag } : {}), ...(o.patch ? { patch: o.patch } : {}) };
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
