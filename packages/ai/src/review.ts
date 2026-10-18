import { callJson, type ModelConfig, type Part } from "./providers.js";

/**
 * The model half of `auto-design review`: a design critique of screenshots
 * against the system's own rules. The deterministic audit already caught
 * what can be measured (colors, contrast, type sizes, overflow), so the model
 * is asked for what can't: hierarchy, spacing rhythm, texture, voice, and
 * whether each screen follows its surface's rules.
 */

export interface CritiqueIssue {
  severity: "high" | "medium" | "low";
  /** Which screenshot: its label, e.g. "/pricing @ 390px dark". */
  screen: string;
  /** Where on the screen, in words: "the header", "the second card". */
  area: string;
  problem: string;
  fix: string;
}

export interface Critique {
  summary: string;
  verdict: "ship" | "polish" | "fix";
  issues: CritiqueIssue[];
}

export const critiqueSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "verdict", "issues"],
  properties: {
    summary: { type: "string", description: "Two sentences: what works, and the most important thing to fix." },
    verdict: { type: "string", enum: ["ship", "polish", "fix"], description: "ship: on-system and clear. polish: small issues. fix: something breaks the system or confuses people." },
    issues: {
      type: "array",
      description: "At most 10, most important first. Only problems a designer would fix.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "screen", "area", "problem", "fix"],
        properties: {
          severity: { type: "string", enum: ["high", "medium", "low"] },
          screen: { type: "string" },
          area: { type: "string" },
          problem: { type: "string" },
          fix: { type: "string", description: "A specific change, in the system's terms: which component, class or rule." },
        },
      },
    },
  },
} as const;

export interface CritiqueInput {
  product: string;
  /** The parts of DESIGN.md that matter for judging screens. */
  rules: string;
  screens: { label: string; png: Buffer | Uint8Array }[];
  /** What the automated audit already found, so the model doesn't repeat it. */
  measured: string[];
  signal?: AbortSignal;
}

const SYSTEM = `You are a senior product designer reviewing screens built with a team's design system.
Judge each screen against the system's rules below, not against your own taste. Look for:
- Hierarchy: one clear page title, one primary action per view, secondary actions quieter.
- Rhythm: consistent spacing and alignment; related things grouped, unrelated things apart.
- Texture: surfaces built the way the system's texture says (borders, shadows, glass only on chrome).
- Type: the right sizes for the surface; display type only for headlines; no walls of text.
- Voice: labels in the system's case, errors that say what to do, no filler or exclamation marks.
- Surface rules: chat, MCP Apps and messaging screens follow their sections.
Report only problems a designer would fix, each with a specific fix in the system's terms (a component, a class, a rule).
Skip anything in the "already measured" list. If the screens are on-system and clear, say so and return few or no issues.`;

export async function critique(model: ModelConfig, input: CritiqueInput): Promise<Critique> {
  const content: Part[] = [
    { type: "text", text: `Design system rules for ${input.product}:\n\n${input.rules}` },
    { type: "text", text: input.measured.length ? `Already measured by the automated audit (don't repeat):\n${input.measured.map((m) => `- ${m}`).join("\n")}` : "The automated audit found nothing." },
  ];
  for (const s of input.screens) {
    content.push({ type: "text", text: `Screen: ${s.label}` });
    content.push({ type: "image", mediaType: "image/png", data: Buffer.from(s.png).toString("base64") });
  }
  content.push({ type: "text", text: "Review these screens. Answer with the JSON schema." });
  const raw = (await callJson(model, { system: SYSTEM, content, schema: critiqueSchema as unknown as Record<string, unknown>, name: "design_review", signal: input.signal })) as Critique;
  return {
    summary: String(raw?.summary ?? ""),
    verdict: (["ship", "polish", "fix"] as const).includes(raw?.verdict) ? raw.verdict : "polish",
    issues: Array.isArray(raw?.issues) ? raw.issues.slice(0, 10) : [],
  };
}

/** The sections of DESIGN.md that bear on judging screens, trimmed to fit a prompt. */
export function rulesForReview(designMd: string, maxChars = 9000): string {
  const keep = /^##\s+(Principles|Texture|Type|Space|Motion|Voice|Surfaces|Components)/i;
  const out: string[] = [];
  let on = false;
  for (const line of designMd.split("\n")) {
    if (/^##\s/.test(line)) on = keep.test(line);
    if (on) out.push(line);
  }
  const text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…` : text;
}
