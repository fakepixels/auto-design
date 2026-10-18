import { MOTION_PROFILES, PAIRINGS, TEXTURES, type DesignConfig } from "@auto-design/core";
import { copySchema, defaultCopy, mergeCopy, type SpecimenCopy } from "./copy.js";
import type { SiteMaterial } from "./extract.js";
import { applyPatch, currentChoices, describeChanges, patchSchema, validate, type DesignPatch } from "./patch.js";
import { callJson, ModelError, type ModelConfig, type Part } from "./providers.js";

const TEXTURE_NOTES: Record<(typeof TEXTURES)[number], string> = {
  minimal: "flat surfaces, hairline borders, one accent; B2B tools and dashboards",
  editorial: "typography-led, paper tones, almost no shadow; fintech, legal, premium consumer",
  glass: "frosted chrome over a tinted backdrop, solid content; consumer, mobile-first, companions",
  tactile: "soft shadows, large corners, presses you feel; consumer and community",
  technical: "crisp borders, monospace labels, dense; developer tools and infrastructure",
};

const MOTION_NOTES: Record<(typeof MOTION_PROFILES)[number], string> = {
  still: "fades only, 100-200ms",
  subtle: "short fades with a hint of scale, 120-260ms",
  expressive: "springier entrances with travel, 150-320ms",
};

function catalog(): string {
  return [
    "Textures:",
    ...TEXTURES.map((t) => `- ${t}: ${TEXTURE_NOTES[t]}`),
    "Font pairings (id: feel):",
    ...PAIRINGS.map((p) => `- ${p.id}: ${p.note}`),
    "Motion profiles:",
    ...MOTION_PROFILES.map((m) => `- ${m}: ${MOTION_NOTES[m]}`),
    "Corner radius: 0 to 20 px. Density: compact (32px controls) or comfortable (36px).",
    "Grays: cool, neutral or warm. Modes: the product loads in light or dark; both always exist.",
  ].join("\n");
}

const BASE_RULES = `You are the design director inside auto-design, an open-source tool that turns a few taste
choices into a design system with hard guardrails. You never write CSS. You fill a typed patch whose
fields are the system's own options; a compiler then checks contrast and every value.

Taste rules:
- Choose with restraint. One brand color, used for the main action and highlights. Grays carry the rest.
- Avoid the generic AI look: no purple or violet by default, no neon on dark unless the product is
  for developers, no rainbow palettes. Prefer a brand color with a clear identity.
- Match the texture to the product and its audience, not to a trend.
- Set a field to null when you have no reason to change it.`;

export interface SuggestInput {
  product: string;
  description?: string;
  site?: SiteMaterial | null;
  images?: Part[];
  /** Dominant colors measured from uploaded images, as hex. */
  imageColors?: string[];
  current: DesignConfig;
  signal?: AbortSignal;
}

export interface Suggestion {
  config: DesignConfig;
  patch: DesignPatch;
  reasons: string[];
  changes: string[];
}

function suggestionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["patch", "reasons"],
    properties: {
      patch: patchSchema(),
      reasons: { type: "array", items: { type: "string" }, description: "2-5 short reasons, one per notable choice, each under 20 words." },
    },
  };
}

/**
 * Run a model call that returns a patch, validate the patched config with the
 * compiler, and ask once more with the error if it fails.
 */
async function patchCall(
  model: ModelConfig,
  current: DesignConfig,
  system: string,
  content: Part[],
  schema: Record<string, unknown>,
  name: string,
  signal?: AbortSignal,
): Promise<{ raw: Record<string, unknown>; config: DesignConfig; patch: DesignPatch }> {
  let history: { role: "user" | "assistant"; text: string }[] = [];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const req = attempt === 0
      ? { system, content, schema, name, signal }
      : {
          system,
          history,
          content: [{ type: "text" as const, text: `The compiler rejected that patch: ${lastError}\nReturn a corrected answer.` }],
          schema,
          name,
          signal,
        };
    const raw = (await callJson(model, req)) as Record<string, unknown>;
    const patch = (raw.patch ?? raw) as DesignPatch;
    const config = applyPatch(current, patch);
    const check = validate(config);
    if (check.ok) return { raw, config, patch };
    lastError = check.error;
    history = [
      { role: "user", text: content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("\n") },
      { role: "assistant", text: JSON.stringify(raw) },
    ];
  }
  throw new ModelError(`The model's suggestion didn't pass the compiler: ${lastError}`);
}

/** Suggest a starting system from what the person has: a name, a site, a logo, screenshots. */
export async function suggest(model: ModelConfig, input: SuggestInput): Promise<Suggestion> {
  const system = `${BASE_RULES}\n\nThe options you can choose from:\n${catalog()}`;
  const lines = [
    `Product: ${input.product || "(unnamed)"}`,
    input.description && `What it is: ${input.description}`,
    input.site && `What their current site shows:\n${input.site.summary}`,
    input.imageColors?.length && `Dominant colors in their uploaded images: ${input.imageColors.join(", ")}`,
    input.images?.length && `${input.images.length} image(s) attached: their logo or screens they like. Use them for color, texture and type hints.`,
    `Current choices: ${JSON.stringify(currentChoices(input.current))}`,
    "Suggest the design system that fits this product best. Keep their existing brand color if they clearly have one.",
  ].filter(Boolean);
  const content: Part[] = [{ type: "text", text: lines.join("\n\n") }, ...(input.images ?? []).slice(0, 4)];
  const { raw, config, patch } = await patchCall(model, input.current, system, content, suggestionSchema(), "design_suggestion", input.signal);
  return {
    config,
    patch,
    reasons: Array.isArray(raw.reasons) ? (raw.reasons as unknown[]).map(String).slice(0, 5) : [],
    changes: describeChanges(input.current, config),
  };
}

export interface RefineResult {
  config: DesignConfig;
  summary: string;
  changes: string[];
}

/** "Warmer." "Less corporate." "Denser, like Linear." Turn a request into a validated change. */
export async function refine(
  model: ModelConfig,
  current: DesignConfig,
  request: string,
  context: { product?: string; description?: string; earlier?: string[]; signal?: AbortSignal } = {},
): Promise<RefineResult> {
  const system = `${BASE_RULES}\n\nThe person is refining their system by describing what they want. Change as little as
satisfies the request. If they name a product (like "Linear" or "Stripe"), translate its feel into these
options; never copy its brand color.\n\nThe options:\n${catalog()}`;
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["patch", "summary"],
    properties: {
      patch: patchSchema(),
      summary: { type: "string", description: "One sentence, under 25 words, saying what you changed and why." },
    },
  };
  const text = [
    context.product && `Product: ${context.product}${context.description ? ` (${context.description})` : ""}`,
    context.earlier?.length && `Earlier requests in this session: ${context.earlier.join(" | ")}`,
    `Current choices: ${JSON.stringify(currentChoices(current))}`,
    `Request: ${request}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const { raw, config } = await patchCall(model, current, system, [{ type: "text", text }], schema, "design_refinement", context.signal);
  const changes = describeChanges(current, config);
  return { config, summary: String(raw.summary ?? "").slice(0, 300) || (changes.length ? "Updated the system." : "Nothing needed to change."), changes };
}

/** Write preview copy for the product, so every taste screen shows their world. */
export async function writeCopy(model: ModelConfig, product: string, description: string, signal?: AbortSignal): Promise<SpecimenCopy> {
  const base = defaultCopy(product, description);
  const system = `You write realistic sample content for a product's design previews: marketing copy, an app
screen, a chat with its assistant, a code snippet and text messages. Be specific and plausible, use real-looking
numbers and names, sentence case everywhere, no exclamation marks, no emoji, no hype words like
"revolutionize", "seamless" or "supercharge".`;
  const raw = (await callJson(model, {
    system,
    content: [{ type: "text", text: `Product: ${product}\nWhat it is: ${description || "(not given; infer from the name)"}` }],
    schema: copySchema(),
    name: "specimen_copy",
    signal,
  })) as Partial<SpecimenCopy>;
  return mergeCopy(base, { ...raw, product });
}
