export type Severity = "error" | "warn" | "off";

export type RuleId =
  | "no-raw-color"
  | "no-palette-color"
  | "no-arbitrary-value"
  | "type-scale"
  | "font-weight"
  | "font-family"
  | "spacing-scale"
  | "radius-scale"
  | "shadow-scale"
  | "motion-duration"
  | "motion-easing"
  | "no-scale-zero"
  | "no-gradient-text"
  | "ui-case"
  | "no-emoji"
  | "no-token-override"
  | "glass-on-content"
  | "display-size";

/** The subset of rules/guardrails.json the checker reads. */
export interface Guardrails {
  version: 1;
  system: string;
  /** The product name, for message checks. Optional for older files. */
  product?: string;
  /** Surfaces the system targets. Optional for older files. */
  surfaces?: string[];
  /** The system's texture (minimal, editorial, glass, tactile, technical). Optional for older files. */
  texture?: string;
  colors: { roles: string[] };
  fonts: { families: string[]; cssFamilies: string[] };
  weights: Record<string, number>;
  text: { steps: string[]; productMax: string };
  spacing: { steps: number[] };
  radius: { steps: string[] };
  shadow: { steps: string[] };
  motion: { durations: number[]; easings: string[]; maxDuration: number; enterScale: number };
  voice: { uiCase: "sentence" | "title"; emoji: "never" | "sparingly" };
  rules: Partial<Record<RuleId, Severity>>;
  ignore: string[];
  /** Tailwind theme namespaces the system owns. Optional for older guardrail files. */
  lockedNamespaces?: string[];
  /** Colors and fonts for agent tools; the checker ignores it. */
  theme?: unknown;
  /** Where the app installed the system from (a folder or a hosted /r/ URL), written by `auto-design add`. */
  registry?: string;
}

/** Guardrails plus lookups derived once per run. */
export interface GuardrailsLike extends Guardrails {
  /** CSS variables the system defines; var(--x) references to these are allowed in arbitrary values. */
  systemVars: Set<string>;
}

export interface Finding {
  rule: RuleId;
  message: string;
}

export interface Violation extends Finding {
  severity: Exclude<Severity, "off">;
  file: string;
  line: number;
  column: number;
}

export interface Allowance {
  file: string;
  line: number;
  rules: string[];
  reason: string;
}

export interface CheckResult {
  violations: Violation[];
  allowances: Allowance[];
  files: number;
  errors: number;
  warnings: number;
}

export function prepare(g: Guardrails): GuardrailsLike {
  const vars = new Set<string>();
  for (const role of g.colors.roles) vars.add(`--${role}`), vars.add(`--color-${role}`);
  for (const s of g.text.steps) vars.add(`--text-${s}`);
  for (const f of g.fonts.families) vars.add(`--font-${f}`);
  for (const n of ["--glass", "--glass-border", "--glass-highlight", "--radius", "--duration-fast", "--duration-base", "--duration-slow", "--enter-scale", "--enter-distance", "--ease-out", "--ease-in-out", "--safe-top", "--safe-right", "--safe-bottom", "--safe-left"]) {
    vars.add(n);
  }
  return { ...g, systemVars: vars };
}
