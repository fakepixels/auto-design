import {
  DISPLAY_SCALES,
  FONTS,
  GRIDS,
  HEROES,
  IMAGERY,
  LABEL_CASES,
  LOGOS,
  MOTION_PROFILES,
  PAIRINGS,
  TEXTURES,
  buildSystem,
  customFonts,
  DEFAULT_ART,
  fontsFor,
  fontsOf,
  pairingFonts,
  pairingOf,
  parseColor,
  toHex,
  type DesignConfig,
  type DesignSystem,
} from "@auto-design/core";

/**
 * A design patch: the only thing a model is allowed to produce. Every field is
 * one of the system's own choices, so a model can't invent CSS. The compiler
 * then validates the result like any hand edit.
 */
export interface DesignPatch {
  brand: string | null;
  neutral: "cool" | "neutral" | "warm" | null;
  defaultMode: "light" | "dark" | null;
  texture: (typeof TEXTURES)[number] | null;
  pairing: string | null;
  /** Faces picked by hand from the catalog, when no pairing fits. Ignored when pairing is set. */
  fonts: { sans: string; mono: string; display: string | null } | null;
  radius: number | null;
  density: "compact" | "comfortable" | null;
  motion: (typeof MOTION_PROFILES)[number] | null;
  energy: number | null;
  warmth: number | null;
  novelty: number | null;
  uiCase: "sentence" | "title" | null;
  emoji: "never" | "sparingly" | null;
  tone: string | null;
  /** Art direction: how much photography carries the page, and how pages are composed. */
  imagery: (typeof IMAGERY)[number] | null;
  hero: (typeof HEROES)[number] | null;
  grid: (typeof GRIDS)[number] | null;
  labels: (typeof LABEL_CASES)[number] | null;
  display: (typeof DISPLAY_SCALES)[number] | null;
  logo: (typeof LOGOS)[number] | null;
}

export const ART_FIELDS = ["imagery", "hero", "grid", "labels", "display", "logo"] as const;

export const PATCH_FIELDS = [
  "brand", "neutral", "defaultMode", "texture", "pairing", "fonts", "radius", "density", "motion",
  "energy", "warmth", "novelty", "uiCase", "emoji", "tone", ...ART_FIELDS,
] as const;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

/** JSON Schema for a patch, valid for Claude and OpenAI strict structured outputs. */
export function patchSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [...PATCH_FIELDS],
    properties: {
      brand: nullable({ type: "string", description: "Brand color as a CSS color: hex, rgb(), hsl() or oklch()." }),
      neutral: nullable({ type: "string", enum: ["cool", "neutral", "warm"], description: "Temperature of the grays." }),
      defaultMode: nullable({ type: "string", enum: ["light", "dark"], description: "Which mode the product loads in." }),
      texture: nullable({ type: "string", enum: [...TEXTURES] }),
      pairing: nullable({ type: "string", enum: PAIRINGS.map((p) => p.id), description: "Font pairing id. Prefer a pairing; use fonts only when none fits." }),
      fonts: nullable({
        type: "object",
        additionalProperties: false,
        required: ["sans", "mono", "display"],
        description: "Faces picked from the catalog by id, used only when pairing is null.",
        properties: {
          sans: { type: "string", enum: fontsFor("body").map((f) => f.id), description: "Body and interface face." },
          mono: { type: "string", enum: fontsFor("mono").map((f) => f.id) },
          display: nullable({ type: "string", enum: fontsFor("display").map((f) => f.id), description: "Headline face, or null to use the body face." }),
        },
      }),
      radius: nullable({ type: "number", description: "Base corner radius in px, 0 to 20." }),
      density: nullable({ type: "string", enum: ["compact", "comfortable"] }),
      motion: nullable({ type: "string", enum: [...MOTION_PROFILES] }),
      energy: nullable({ type: "number", description: "0 calm to 1 energetic." }),
      warmth: nullable({ type: "number", description: "0 precise to 1 warm." }),
      novelty: nullable({ type: "number", description: "0 classic to 1 experimental." }),
      uiCase: nullable({ type: "string", enum: ["sentence", "title"] }),
      emoji: nullable({ type: "string", enum: ["never", "sparingly"] }),
      tone: nullable({ type: "string", description: "One sentence on how the product talks." }),
      imagery: nullable({ type: "string", enum: [...IMAGERY], description: "How much photography carries the pages: none, supporting, or leading (the photos are the page, as on a fashion or travel site)." }),
      hero: nullable({
        type: "string",
        enum: [...HEROES],
        description: "A landing page's first screen: type (words only), centered, split (copy beside a picture), full-bleed (a photo fills the screen, words over it) or editorial (a magazine column beside a tall picture).",
      }),
      grid: nullable({ type: "string", enum: [...GRIDS], description: "Collections: cards (boxed), open (pictures and captions without boxes) or editorial (one large item beside smaller ones)." }),
      labels: nullable({ type: "string", enum: [...LABEL_CASES], description: "Navigation and small labels in sentence case, or uppercase with wide tracking (luxury, editorial)." }),
      display: nullable({ type: "string", enum: [...DISPLAY_SCALES], description: "Headline scale: standard, or dramatic (display headlines far larger than the text)." }),
      logo: nullable({ type: "string", enum: [...LOGOS], description: "Header logo: a letter mark beside the name, or the name alone as a spaced wordmark." }),
    },
  };
}

export const emptyPatch = (): DesignPatch => Object.fromEntries(PATCH_FIELDS.map((f) => [f, null])) as unknown as DesignPatch;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Apply a patch to a config. Values outside the system's options are clamped or dropped, never passed through. */
export function applyPatch(config: DesignConfig, patch: Partial<DesignPatch>): DesignConfig {
  const next: DesignConfig = structuredClone(config);
  if (patch.brand) next.color = { ...next.color, brand: patch.brand.trim() };
  if (patch.neutral) next.color = { ...next.color, neutral: patch.neutral };
  if (patch.defaultMode) next.color = { ...next.color, modes: "both", defaultMode: patch.defaultMode };
  if (patch.texture && (TEXTURES as readonly string[]).includes(patch.texture)) next.texture = patch.texture;
  if (patch.pairing && PAIRINGS.some((p) => p.id === patch.pairing)) {
    const fonts = pairingFonts(patch.pairing);
    next.type = { ...next.type, sans: fonts.sans, mono: fonts.mono, display: fonts.display };
    if (!fonts.display) delete next.type.display;
  } else if (patch.fonts && FONTS[patch.fonts.sans] && FONTS[patch.fonts.mono]) {
    try {
      const fonts = customFonts(patch.fonts);
      next.type = { ...next.type, sans: fonts.sans, mono: fonts.mono, display: fonts.display };
      if (!fonts.display) delete next.type.display;
    } catch {
      // A face in the wrong role (a display face as body text): keep the current type.
    }
  }
  if (typeof patch.radius === "number" && Number.isFinite(patch.radius)) {
    next.shape = { ...next.shape, radius: Math.round(Math.min(20, Math.max(0, patch.radius))) };
  }
  if (patch.density) next.density = patch.density;
  if (patch.motion && (MOTION_PROFILES as readonly string[]).includes(patch.motion)) next.motion = patch.motion;
  const personality = { energy: 0.3, warmth: 0.4, novelty: 0.3, ...next.personality };
  if (typeof patch.energy === "number") personality.energy = clamp01(patch.energy);
  if (typeof patch.warmth === "number") personality.warmth = clamp01(patch.warmth);
  if (typeof patch.novelty === "number") personality.novelty = clamp01(patch.novelty);
  next.personality = personality;
  const voice = { uiCase: "sentence" as const, emoji: "never" as const, tone: "", ...next.voice };
  if (patch.uiCase) voice.uiCase = patch.uiCase;
  if (patch.emoji) voice.emoji = patch.emoji;
  if (patch.tone) voice.tone = patch.tone.trim().slice(0, 240);
  next.voice = voice;
  const art = { ...DEFAULT_ART, ...next.art };
  const pick = <T extends readonly string[]>(list: T, v: unknown): T[number] | undefined => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : undefined);
  art.imagery = pick(IMAGERY, patch.imagery) ?? art.imagery;
  art.hero = pick(HEROES, patch.hero) ?? art.hero;
  art.grid = pick(GRIDS, patch.grid) ?? art.grid;
  art.labels = pick(LABEL_CASES, patch.labels) ?? art.labels;
  art.display = pick(DISPLAY_SCALES, patch.display) ?? art.display;
  art.logo = pick(LOGOS, patch.logo) ?? art.logo;
  next.art = art;
  return next;
}

/** Check a patched config the way the compiler will. Returns the built system, or why it failed. */
export function validate(config: DesignConfig): { ok: true; system: DesignSystem } | { ok: false; error: string } {
  try {
    if (config.color.brand) parseColor(config.color.brand);
    return { ok: true, system: buildSystem(config) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** The config's current choices, written the way a patch would set them, for prompts and diffs. */
export function currentChoices(config: DesignConfig): DesignPatch {
  return {
    brand: config.color.brand,
    neutral: config.color.neutral ?? "neutral",
    defaultMode: config.color.defaultMode ?? "light",
    texture: config.texture,
    pairing: pairingOf(config),
    fonts: pairingOf(config) ? null : (() => {
      const f = fontsOf(config);
      return f.sans && f.mono ? { sans: f.sans, mono: f.mono, display: f.display } : null;
    })(),
    radius: config.shape?.radius ?? 8,
    density: config.density ?? "comfortable",
    motion: config.motion ?? "subtle",
    energy: config.personality?.energy ?? 0.3,
    warmth: config.personality?.warmth ?? 0.4,
    novelty: config.personality?.novelty ?? 0.3,
    uiCase: config.voice?.uiCase ?? "sentence",
    emoji: config.voice?.emoji ?? "never",
    tone: config.voice?.tone ?? null,
    imagery: config.art?.imagery ?? DEFAULT_ART.imagery,
    hero: config.art?.hero ?? DEFAULT_ART.hero,
    grid: config.art?.grid ?? DEFAULT_ART.grid,
    labels: config.art?.labels ?? DEFAULT_ART.labels,
    display: config.art?.display ?? DEFAULT_ART.display,
    logo: config.art?.logo ?? DEFAULT_ART.logo,
  };
}

/** What changed between two configs, as readable lines for the undo history. */
export function describeChanges(before: DesignConfig, after: DesignConfig): string[] {
  const a = currentChoices(before);
  const b = currentChoices(after);
  const label: Record<string, string> = {
    brand: "Brand color", neutral: "Grays", defaultMode: "Loads in", texture: "Texture", pairing: "Type", fonts: "Typefaces",
    radius: "Corners", density: "Density", motion: "Motion", energy: "Energy", warmth: "Warmth",
    novelty: "Novelty", uiCase: "Label case", emoji: "Emoji", tone: "Voice",
    imagery: "Photography", hero: "First screen", grid: "Collections", labels: "Labels", display: "Headlines", logo: "Logo",
  };
  const fmt = (k: string, v: unknown) => {
    if (v === null || v === undefined) return "none";
    if (k === "radius") return `${v}px`;
    if (k === "pairing") return PAIRINGS.find((p) => p.id === v)?.name ?? String(v);
    if (k === "fonts") {
      const f = v as { sans: string; display: string | null };
      return [f.display, f.sans].filter(Boolean).map((id) => FONTS[id!]?.google ?? id).join(" + ");
    }
    if (typeof v === "number") return `${Math.round(v * 100)}%`;
    if (k === "defaultMode") return `${v} mode`;
    if (k === "brand") {
      try {
        return toHex(parseColor(String(v)));
      } catch {
        return String(v);
      }
    }
    return String(v);
  };
  // Values that read the same after formatting (a brand nudged within one hex step) aren't a change to show.
  return PATCH_FIELDS.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]) && fmt(k, a[k]) !== fmt(k, b[k])).map(
    (k) => `${label[k]}: ${fmt(k, a[k])} → ${fmt(k, b[k])}`,
  );
}
