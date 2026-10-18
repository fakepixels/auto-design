import {
  ConfigError,
  BuildError,
  FONTS,
  MOTION_PROFILES,
  PAIRINGS,
  SURFACES,
  TEXTURES,
  buildSystem,
  specimenData,
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

export interface Session {
  product: { name: string; description: string; url: string };
  config: DesignConfig;
  preset: string;
  copy: SpecimenCopy;
  model: (ModelConfig & { label: string }) | null;
  site: SiteMaterial | null;
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
  if (!presets[preset]) throw new Error(`Unknown preset "${preset}"`);
  const next = presetFor(preset, session.product);
  next.surfaces = session.config.surfaces?.length ? session.config.surfaces : next.surfaces;
  commit(session, next, `Started from ${presets[preset]!.displayName}`);
  session.preset = preset;
}

export type VariantField = "preset" | "texture" | "pairing" | "radius" | "density" | "motion" | "neutral" | "defaultMode";

export interface Variant {
  value: string | number;
  name: string;
  note: string;
  specimen?: SpecimenData;
  error?: string;
}

/** The options for a taste question, each drawn on the person's own system. */
export function variants(session: Session, field: VariantField): Variant[] {
  const list: { value: string | number; name: string; note: string; config: () => DesignConfig }[] = [];
  const with_ = (patch: Partial<DesignPatch>) => () => applyPatch(session.config, patch);
  switch (field) {
    case "preset":
      for (const [id, p] of Object.entries(presets)) {
        list.push({ value: id, name: p.displayName, note: p.description ?? "", config: () => presetFor(id, session.product) });
      }
      break;
    case "texture":
      for (const t of TEXTURES) list.push({ value: t, ...TEXTURE_INFO[t], config: with_({ texture: t }) });
      break;
    case "pairing":
      for (const p of PAIRINGS) {
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
  }
  return list.map((o) => {
    try {
      return { value: o.value, name: o.name, note: o.note, specimen: specimen(o.config()) };
    } catch (err) {
      return { value: o.value, name: o.name, note: o.note, error: errorText(err) };
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
