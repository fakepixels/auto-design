import type { DesignConfig } from "@auto-design/core";
import { copySchema, defaultCopy } from "./copy.js";
import { currentChoices, emptyPatch, type DesignPatch } from "./patch.js";
import type { JsonRequest } from "./providers.js";

/**
 * Deterministic tweaks for the quick-change chips. They work without a model,
 * and the mock model uses them so the whole flow can be tested offline.
 */
export function quickTweak(config: DesignConfig, request: string): Partial<DesignPatch> {
  const r = request.toLowerCase();
  const now = currentChoices(config);
  const p: Partial<DesignPatch> = {};
  const nudge = (v: number | null, d: number) => Math.min(1, Math.max(0, (v ?? 0.4) + d));
  if (/warm/.test(r)) Object.assign(p, { neutral: "warm", warmth: nudge(now.warmth, 0.2) });
  if (/cool|colder|crisp/.test(r)) Object.assign(p, { neutral: "cool", warmth: nudge(now.warmth, -0.2) });
  if (/round|soft|friendl/.test(r)) p.radius = Math.min(20, (now.radius ?? 8) + 4);
  if (/sharp|square|serious/.test(r)) p.radius = Math.max(0, (now.radius ?? 8) - 3);
  if (/dens|compact|tight|linear/.test(r)) p.density = "compact";
  if (/roomi|spacious|airy|breath/.test(r)) p.density = "comfortable";
  if (/calm|still|less motion|quiet/.test(r)) Object.assign(p, { motion: "still", energy: nudge(now.energy, -0.2) });
  if (/livel|playful|energetic|bouncy|more motion/.test(r)) Object.assign(p, { motion: "expressive", energy: nudge(now.energy, 0.2) });
  if (/dark/.test(r)) p.defaultMode = "dark";
  if (/light mode|lighter mode|light first/.test(r)) p.defaultMode = "light";
  if (/editorial|serif|literary|elegant/.test(r)) Object.assign(p, { pairing: "instrument", texture: "editorial" });
  if (/technical|developer|terminal|mono/.test(r)) Object.assign(p, { pairing: "plex", texture: "technical" });
  if (/glass|frost|translucent/.test(r)) p.texture = "glass";
  if (/less corporate|human|approachable/.test(r)) Object.assign(p, { warmth: nudge(now.warmth, 0.25), novelty: nudge(now.novelty, 0.15), pairing: "figtree", radius: Math.min(20, (now.radius ?? 8) + 2) });
  if (/bolder|more character|distinctive/.test(r)) Object.assign(p, { pairing: "bricolage", novelty: nudge(now.novelty, 0.25) });
  return p;
}

function guessTexture(text: string): DesignPatch["texture"] {
  const t = text.toLowerCase();
  if (/developer|api|infra|cli|devops|database|observab|terminal/.test(t)) return "technical";
  if (/financ|bank|legal|law|wealth|insur|luxury|journal|publish/.test(t)) return "editorial";
  if (/community|social|friends|club|kids|learn|game|creator/.test(t)) return "tactile";
  if (/companion|assistant|mobile|consumer|wellness|travel|music/.test(t)) return "glass";
  return "minimal";
}

const PAIRING_FOR: Record<NonNullable<DesignPatch["texture"]>, string> = {
  minimal: "geist",
  editorial: "instrument",
  glass: "figtree",
  tactile: "bricolage",
  technical: "plex",
};

/** A mock model: answers each schema the real prompts use, from the text it was given. */
export function mockDesigner(config: () => DesignConfig) {
  return (req: JsonRequest): unknown => {
    const text = req.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("\n");
    if (req.name === "specimen_copy") {
      const product = /Product: (.*)/.exec(text)?.[1]?.trim() ?? "Northwind";
      const description = /What it is: (.*)/.exec(text)?.[1]?.replace(/^\(not given.*\)$/, "").trim() ?? "";
      const c = defaultCopy(product, description);
      const { product: _p, ...rest } = c;
      void copySchema;
      return rest;
    }
    if (req.name === "design_refinement") {
      const request = /Request: ([\s\S]*)$/.exec(text)?.[1]?.trim() ?? text;
      const patch = { ...emptyPatch(), ...quickTweak(config(), request) };
      const changed = Object.entries(patch).filter(([, v]) => v !== null).map(([k]) => k);
      return { patch, summary: changed.length ? `Adjusted ${changed.join(", ")} to match "${request}".` : `Nothing in the system maps to "${request}" yet.` };
    }
    // design_suggestion
    const texture = guessTexture(text);
    const colors = /Dominant colors in their uploaded images: (.*)/.exec(text)?.[1]?.split(",").map((s) => s.trim()) ??
      /Most used brand-like colors: (#[0-9a-f]{6})/i.exec(text)?.slice(1) ??
      [];
    const patch: DesignPatch = { ...emptyPatch(), texture, pairing: PAIRING_FOR[texture!] };
    if (colors[0]) patch.brand = colors[0];
    if (texture === "technical") Object.assign(patch, { defaultMode: "dark", density: "compact", radius: 4 });
    if (texture === "tactile") Object.assign(patch, { radius: 16, motion: "expressive" });
    if (texture === "glass") Object.assign(patch, { radius: 12, motion: "expressive" });
    if (texture === "editorial") Object.assign(patch, { radius: 4, motion: "still", neutral: "warm" });
    return {
      patch,
      reasons: [
        `${texture![0]!.toUpperCase()}${texture!.slice(1)} texture fits what the product does.`,
        colors[0] ? `Kept ${colors[0]} from your material as the brand color.` : "Kept your current brand color.",
      ],
    };
  };
}
