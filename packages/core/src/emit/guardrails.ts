import { PRODUCT_MAX_STEP, SHADOW_STEPS, TYPE_STEPS } from "../scales.js";
import { ROLE_NAMES, type DesignSystem } from "../system.js";
import { LOCKED_NAMESPACES } from "./css.js";
import { WEIGHT_NAMES } from "./shared.js";

export type Severity = "error" | "warn" | "off";

/** Every rule the checker knows, with its default severity. */
export const RULES = {
  "no-raw-color": { severity: "error", summary: "Colors come from semantic roles, never hex, rgb, hsl or oklch literals." },
  "no-palette-color": { severity: "error", summary: "Tailwind palette colors (bg-blue-500, text-white) do not exist in this system." },
  "no-arbitrary-value": { severity: "error", summary: "No arbitrary values for color, type, spacing, radius, shadow or motion (p-[13px], text-[#333])." },
  "type-scale": { severity: "error", summary: "Text sizes come from the type scale only." },
  "font-weight": { severity: "error", summary: "Only the system's font weights exist." },
  "font-family": { severity: "error", summary: "Only the system's font families exist." },
  "spacing-scale": { severity: "error", summary: "Padding, margin and gaps use the spacing steps only." },
  "radius-scale": { severity: "error", summary: "Corner radius uses the radius steps only." },
  "shadow-scale": { severity: "error", summary: "Shadows use the elevation steps only." },
  "motion-duration": { severity: "error", summary: "Durations come from the motion profile only." },
  "motion-easing": { severity: "error", summary: "Easings come from the motion profile only." },
  "no-scale-zero": { severity: "error", summary: "Never animate in from scale(0); start near the enter scale with a fade." },
  "no-gradient-text": { severity: "warn", summary: "No gradient-filled text." },
  "ui-case": { severity: "warn", summary: "Button and menu labels follow the system's case." },
  "no-emoji": { severity: "warn", summary: "No emoji in product UI." },
  "no-token-override": { severity: "error", summary: "App CSS may not redefine the system's variables or theme keys." },
} as const satisfies Record<string, { severity: Severity; summary: string }>;

export type RuleId = keyof typeof RULES;

export interface Guardrails {
  version: 1;
  system: string;
  colors: { roles: string[] };
  fonts: { families: string[]; cssFamilies: string[] };
  weights: Record<string, number>;
  text: { steps: string[]; productMax: string };
  spacing: { steps: number[] };
  radius: { steps: string[] };
  shadow: { steps: string[] };
  motion: { durations: number[]; easings: string[]; maxDuration: number; enterScale: number };
  voice: { uiCase: "sentence" | "title"; emoji: "never" | "sparingly" };
  rules: Record<RuleId, Severity>;
  /** Paths the checker skips: generated files and vendored code. */
  ignore: string[];
  /** Tailwind theme namespaces the system owns. */
  lockedNamespaces: string[];
}

export function buildGuardrails(s: DesignSystem): Guardrails {
  const rules = {} as Record<RuleId, Severity>;
  for (const [id, def] of Object.entries(RULES) as [RuleId, (typeof RULES)[RuleId]][]) {
    rules[id] = (s.config.rules[id] as Severity | undefined) ?? def.severity;
  }
  if (s.config.voice.emoji === "sparingly") rules["no-emoji"] = "off";

  const families = ["sans", "mono", ...(s.type.fonts.display ? ["display"] : [])];
  const weights: Record<string, number> = {};
  for (const w of s.type.weights) weights[WEIGHT_NAMES[w]!] = w;

  return {
    version: 1,
    system: s.config.name,
    colors: { roles: [...ROLE_NAMES, "transparent", "current", "inherit"] },
    fonts: {
      families,
      cssFamilies: [s.type.fonts.sans, s.type.fonts.mono, s.type.fonts.display]
        .filter((f) => f !== undefined)
        .map((f) => f.family),
    },
    weights,
    text: { steps: [...TYPE_STEPS], productMax: PRODUCT_MAX_STEP },
    spacing: { steps: [...s.spacing] },
    radius: { steps: ["none", "sm", "md", "lg", "xl", "full"] },
    shadow: { steps: ["none", ...SHADOW_STEPS] },
    motion: {
      durations: [0, s.motion.durations.fast, s.motion.durations.base, s.motion.durations.slow],
      easings: ["linear", "out", "in-out"],
      maxDuration: s.motion.maxDuration,
      enterScale: s.motion.enterScale,
    },
    voice: { uiCase: s.config.voice.uiCase, emoji: s.config.voice.emoji },
    rules,
    ignore: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/auto-design.css", "**/*.d.ts"],
    lockedNamespaces: [...LOCKED_NAMESPACES],
  };
}

export function emitGuardrails(s: DesignSystem): Record<string, string> {
  return { "rules/guardrails.json": JSON.stringify(buildGuardrails(s), null, 2) + "\n" };
}
