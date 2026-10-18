import {
  MOTION_PROFILES,
  PAIRINGS,
  TEXTURES,
  buildSystem,
  pairingFonts,
  pairingOf,
  parseColor,
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
  radius: number | null;
  density: "compact" | "comfortable" | null;
  motion: (typeof MOTION_PROFILES)[number] | null;
  energy: number | null;
  warmth: number | null;
  novelty: number | null;
  uiCase: "sentence" | "title" | null;
  emoji: "never" | "sparingly" | null;
  tone: string | null;
}

export const PATCH_FIELDS = [
  "brand", "neutral", "defaultMode", "texture", "pairing", "radius", "density", "motion",
  "energy", "warmth", "novelty", "uiCase", "emoji", "tone",
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
      pairing: nullable({ type: "string", enum: PAIRINGS.map((p) => p.id), description: "Font pairing id." }),
      radius: nullable({ type: "number", description: "Base corner radius in px, 0 to 20." }),
      density: nullable({ type: "string", enum: ["compact", "comfortable"] }),
      motion: nullable({ type: "string", enum: [...MOTION_PROFILES] }),
      energy: nullable({ type: "number", description: "0 calm to 1 energetic." }),
      warmth: nullable({ type: "number", description: "0 precise to 1 warm." }),
      novelty: nullable({ type: "number", description: "0 classic to 1 experimental." }),
      uiCase: nullable({ type: "string", enum: ["sentence", "title"] }),
      emoji: nullable({ type: "string", enum: ["never", "sparingly"] }),
      tone: nullable({ type: "string", description: "One sentence on how the product talks." }),
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
    radius: config.shape?.radius ?? 8,
    density: config.density ?? "comfortable",
    motion: config.motion ?? "subtle",
    energy: config.personality?.energy ?? 0.3,
    warmth: config.personality?.warmth ?? 0.4,
    novelty: config.personality?.novelty ?? 0.3,
    uiCase: config.voice?.uiCase ?? "sentence",
    emoji: config.voice?.emoji ?? "never",
    tone: config.voice?.tone ?? null,
  };
}

/** What changed between two configs, as readable lines for the undo history. */
export function describeChanges(before: DesignConfig, after: DesignConfig): string[] {
  const a = currentChoices(before);
  const b = currentChoices(after);
  const label: Record<string, string> = {
    brand: "Brand color", neutral: "Grays", defaultMode: "Loads in", texture: "Texture", pairing: "Type",
    radius: "Corners", density: "Density", motion: "Motion", energy: "Energy", warmth: "Warmth",
    novelty: "Novelty", uiCase: "Label case", emoji: "Emoji", tone: "Voice",
  };
  const fmt = (k: string, v: unknown) => {
    if (v === null || v === undefined) return "none";
    if (k === "radius") return `${v}px`;
    if (k === "pairing") return PAIRINGS.find((p) => p.id === v)?.name ?? String(v);
    if (typeof v === "number") return `${Math.round(v * 100)}%`;
    if (k === "defaultMode") return `${v} mode`;
    return String(v);
  };
  return PATCH_FIELDS.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(
    (k) => `${label[k]}: ${fmt(k, a[k])} → ${fmt(k, b[k])}`,
  );
}
