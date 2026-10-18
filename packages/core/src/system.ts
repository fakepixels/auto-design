import {
  brandScale,
  contrast,
  ensureContrast,
  inGamut,
  neutralScale,
  parseColor,
  statusScale,
  toCss,
  type ContrastFix,
  type Oklch,
  type Scale,
  type Step,
} from "./color.js";
import {
  MOTION,
  SPACING_STEPS,
  controlHeights,
  radiusScale,
  shadows,
  typeScale,
  type MotionProfile,
  type ShadowLayer,
  type ShadowStep,
  type TypeStep,
  type TypeStepValue,
} from "./scales.js";
import { parseConfig, type DesignConfig, type FontConfig, type ResolvedConfig } from "./schema.js";

export const ROLE_NAMES = [
  "background", "foreground",
  "card", "card-foreground",
  "popover", "popover-foreground",
  "primary", "primary-foreground",
  "secondary", "secondary-foreground",
  "muted", "muted-foreground",
  "accent", "accent-foreground",
  "destructive", "destructive-foreground",
  "success", "success-foreground",
  "warning", "warning-foreground",
  "border", "input", "ring", "overlay",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "sidebar", "sidebar-foreground",
  "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground",
  "sidebar-border", "sidebar-ring",
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];
export type Roles = Record<RoleName, Oklch>;
export type Mode = "light" | "dark";

/** Text that must stay readable: [text role, surface roles it sits on]. WCAG AA body text. */
const TEXT_PAIRS: [RoleName, RoleName[]][] = [
  ["foreground", ["background", "card", "popover"]],
  ["card-foreground", ["card"]],
  ["popover-foreground", ["popover"]],
  ["muted-foreground", ["background", "card", "muted"]],
  ["destructive", ["background", "card"]],
  ["sidebar-foreground", ["sidebar"]],
];

/**
 * Solid fills with text on them: [fill, its foreground, policy].
 * "brand" fills keep their exact color and flip the label if needed;
 * "status" fills keep their label and shift the fill instead, so every
 * status reads the same way.
 */
const FILL_PAIRS: [RoleName, RoleName, "brand" | "status"][] = [
  ["primary", "primary-foreground", "brand"],
  ["secondary", "secondary-foreground", "status"],
  ["accent", "accent-foreground", "status"],
  ["destructive", "destructive-foreground", "status"],
  ["success", "success-foreground", "status"],
  ["warning", "warning-foreground", "status"],
  ["sidebar-primary", "sidebar-primary-foreground", "brand"],
  ["sidebar-accent", "sidebar-accent-foreground", "status"],
];

/** Round down for display, so a ratio just under a threshold never prints as passing. */
const floor2 = (n: number) => Math.floor(n * 100) / 100;

export const TEXT_MIN = 4.5;
export const UI_MIN = 3;

export interface ContrastCheck {
  mode: Mode;
  fg: RoleName;
  bg: RoleName;
  ratio: number;
  min: number;
  pass: boolean;
}

export interface BuildReport {
  /** Values the compiler changed to satisfy a rule. */
  fixes: ContrastFix[];
  checks: ContrastCheck[];
  /** Things worth knowing that don't fail the build. */
  notes: string[];
}

export interface DesignSystem {
  config: ResolvedConfig;
  palettes: { brand: Scale; neutral: Scale; danger: Scale; success: Scale; warning: Scale };
  brand: { seed: Oklch; step: Step };
  roles: Record<Mode, Roles>;
  type: {
    scale: Record<TypeStep, TypeStepValue>;
    fonts: { sans: FontConfig; mono: FontConfig; display?: FontConfig };
    /** Every weight any family uses; the only font-weight utilities that exist. */
    weights: number[];
  };
  spacing: readonly number[];
  controls: { sm: number; md: number; lg: number };
  radius: ReturnType<typeof radiusScale>;
  shadows: Record<ShadowStep, ShadowLayer[]>;
  motion: MotionProfile;
  report: BuildReport;
}

export class BuildError extends Error {
  constructor(message: string, public report: BuildReport) {
    super(message);
    this.name = "BuildError";
  }
}

const WHITE: Oklch = { l: 1, c: 0, h: 0 };

function rolesFor(mode: Mode, cfg: ResolvedConfig, p: DesignSystem["palettes"], primary: Oklch): Roles {
  const n = p.neutral;
  const t = cfg.texture;
  const light = mode === "light";

  const background = light ? (t === "minimal" || t === "technical" ? WHITE : n[50]) : n[950];
  const card = light
    ? t === "editorial" || t === "tactile" || t === "glass" ? WHITE : background
    : t === "technical" ? n[950] : n[900];
  const surfaceText = light ? n[950] : n[50];

  const brandHue = primary.h;
  const chart = (l: number, c: number, dh: number): Oklch => inGamut({ l, c, h: (brandHue + dh + 360) % 360 });

  return {
    background,
    foreground: surfaceText,
    card,
    "card-foreground": surfaceText,
    popover: card,
    "popover-foreground": surfaceText,
    primary,
    "primary-foreground": light ? n[50] : n[50],
    secondary: light ? n[100] : n[800],
    "secondary-foreground": light ? n[900] : n[50],
    muted: light ? n[100] : n[800],
    "muted-foreground": light ? n[500] : n[400],
    accent: light ? n[100] : n[800],
    "accent-foreground": light ? n[900] : n[50],
    destructive: light ? p.danger[600] : p.danger[400],
    "destructive-foreground": light ? n[50] : n[950],
    success: light ? p.success[600] : p.success[400],
    "success-foreground": light ? n[50] : n[950],
    warning: light ? p.warning[400] : p.warning[400],
    "warning-foreground": n[950],
    border: light ? (t === "technical" ? n[300] : n[200]) : n[800],
    input: light ? n[300] : n[700],
    ring: primary,
    overlay: { l: 0, c: 0, h: 0, alpha: light ? 0.4 : 0.6 },
    "chart-1": primary,
    "chart-2": chart(light ? 0.72 : 0.75, 0.12, 40),
    "chart-3": chart(light ? 0.6 : 0.68, 0.11, 160),
    "chart-4": chart(light ? 0.78 : 0.8, 0.1, -60),
    "chart-5": light ? n[400] : n[500],
    sidebar: light ? (background === WHITE ? n[50] : background) : n[900],
    "sidebar-foreground": surfaceText,
    "sidebar-primary": primary,
    "sidebar-primary-foreground": n[50],
    "sidebar-accent": light ? n[100] : n[800],
    "sidebar-accent-foreground": light ? n[900] : n[50],
    "sidebar-border": light ? n[200] : n[800],
    "sidebar-ring": primary,
  };
}

/**
 * The brand color stays exact in light mode. In dark mode a deep brand color
 * sinks into the page and can't be read as text (links, code, selected
 * states), so it steps lighter along its own scale until it reads as text on
 * the hardest dark surface, muted (4.5:1).
 */
function primaryFor(mode: Mode, brand: Scale, seedStep: Step, n: Scale, report: BuildReport, page: Oklch): Oklch {
  const seed = brand[seedStep];
  if (mode === "light") {
    const onPage = contrast(seed, page);
    const onPanel = contrast(seed, n[100]);
    if (onPage < TEXT_MIN) {
      report.notes.push(
        `light: the brand color is ${floor2(onPage)}:1 on the page, too light for text. Use it for fills; links and highlighted text use text-foreground with an underline.`,
      );
    } else if (onPanel < TEXT_MIN) {
      report.notes.push(
        `light: the brand color reads as text on the page (${floor2(onPage)}:1) but not on gray panels such as code blocks (${floor2(onPanel)}:1). Keep text-primary off bg-muted.`,
      );
    }
    return seed;
  }
  const hardest = n[800];
  if (contrast(seed, hardest) >= TEXT_MIN) return seed;
  const steps = Object.keys(brand).map(Number) as Step[];
  const lighter = steps.filter((s) => s < seedStep).sort((a, b) => b - a);
  for (const step of lighter) {
    if (contrast(brand[step], hardest) >= TEXT_MIN) {
      report.notes.push(`dark: primary uses brand-${step}, a lighter step of the brand color, so it reads as text on dark surfaces.`);
      return brand[step];
    }
  }
  return seed;
}

/** Pick the label color for a fill: the preferred one if it passes, else whichever reads better. */
function labelFor(fill: Oklch, preferred: Oklch, alternate: Oklch): Oklch {
  if (contrast(preferred, fill) >= TEXT_MIN) return preferred;
  if (contrast(alternate, fill) >= TEXT_MIN) return alternate;
  return contrast(preferred, fill) >= contrast(alternate, fill) ? preferred : alternate;
}

function enforce(mode: Mode, roles: Roles, n: Scale, report: BuildReport) {
  const record = (role: RoleName, against: RoleName, before: Oklch, after: Oklch) => {
    report.fixes.push({
      role,
      against,
      mode,
      before: floor2(contrast(before, roles[against])),
      after: +contrast(after, roles[against]).toFixed(2),
      from: toCss(before),
      to: toCss(after),
    });
  };

  // 1. Text roles must read on every surface they sit on.
  for (const [text, surfaces] of TEXT_PAIRS) {
    for (const surface of surfaces) {
      const before = roles[text];
      const after = ensureContrast(before, roles[surface], TEXT_MIN);
      if (!after) throw new BuildError(`${mode}: no ${text} color reaches ${TEXT_MIN}:1 on ${surface}`, report);
      if (after !== before) {
        record(text, surface, before, after);
        roles[text] = after;
      }
    }
  }

  // 2. Labels on fills: choose light or dark text, then nudge if still short.
  const lightLabel = n[50];
  const darkLabel = n[950];
  for (const [fill, label, policy] of FILL_PAIRS) {
    const preferred = roles[label];
    if (contrast(preferred, roles[fill]) >= TEXT_MIN) continue;

    if (policy === "status") {
      // Keep the label; move the fill away from it until the label reads.
      const before = roles[fill];
      const moved = ensureContrast(before, preferred, TEXT_MIN);
      if (!moved) throw new BuildError(`${mode}: no ${fill} color carries a readable label`, report);
      roles[fill] = moved;
      report.fixes.push({
        role: fill,
        against: label,
        mode,
        before: floor2(contrast(before, preferred)),
        after: +contrast(moved, preferred).toFixed(2),
        from: toCss(before),
        to: toCss(moved),
      });
      continue;
    }

    // Brand fills stay exact: try the other label color, then nudge the label.
    const alternate = preferred.l > 0.5 ? darkLabel : lightLabel;
    const chosen = labelFor(roles[fill], preferred, alternate);
    if (chosen !== preferred) {
      report.notes.push(`${mode}: ${label} uses ${chosen.l > 0.5 ? "light" : "dark"} text to read on ${fill}.`);
    }
    const fixed = ensureContrast(chosen, roles[fill], TEXT_MIN);
    if (fixed) {
      if (fixed !== chosen) record(label, fill, chosen, fixed);
      roles[label] = fixed;
      continue;
    }
    // Mid-tone brands (around L 0.55-0.6) can't carry white or black text at
    // 4.5:1. Keep the hue and strength, and move the fill just far enough.
    const before = roles[fill];
    const label0 = chosen.l > 0.5 ? lightLabel : darkLabel;
    const moved = ensureContrast(before, label0, TEXT_MIN);
    if (!moved) throw new BuildError(`${mode}: no label color reaches ${TEXT_MIN}:1 on ${fill}`, report);
    roles[fill] = moved;
    roles[label] = label0;
    report.fixes.push({
      role: fill,
      against: label,
      mode,
      before: floor2(contrast(before, label0)),
      after: +contrast(moved, label0).toFixed(2),
      from: toCss(before),
      to: toCss(moved),
    });
    report.notes.push(`${mode}: the brand color sits where neither white nor black text reads on it, so ${fill} is shifted slightly ${moved.l < before.l ? "darker" : "lighter"}.`);
    if (fill === "primary") {
      if (toCss(roles.ring) === toCss(before)) roles.ring = moved;
      if (toCss(roles["chart-1"]) === toCss(before)) roles["chart-1"] = moved;
    }
  }

  // 3. Focus rings must be visible against the page (WCAG 2.2 non-text contrast).
  for (const ring of ["ring", "sidebar-ring"] as const) {
    const before = roles[ring];
    const after = ensureContrast(before, roles.background, UI_MIN);
    if (after && after !== before) {
      record(ring, "background", before, after);
      roles[ring] = after;
    }
  }

  // 4. Notes on things that are allowed but deserve a sentence in DESIGN.md.
  if (contrast(roles.primary, roles.background) < UI_MIN) {
    report.notes.push(
      `${mode}: the brand color is ${contrast(roles.primary, roles.background).toFixed(1)}:1 against the page, so primary buttons rely on their label and shape. Do not use text-primary for body copy.`,
    );
  }
}

function collectChecks(mode: Mode, roles: Roles, report: BuildReport) {
  for (const [text, surfaces] of TEXT_PAIRS) {
    for (const surface of surfaces) {
      const ratio = contrast(roles[text], roles[surface]);
      report.checks.push({ mode, fg: text, bg: surface, ratio: +ratio.toFixed(2), min: TEXT_MIN, pass: ratio >= TEXT_MIN });
    }
  }
  for (const [fill, label] of FILL_PAIRS) {
    const ratio = contrast(roles[label], roles[fill]);
    report.checks.push({ mode, fg: label, bg: fill, ratio: +ratio.toFixed(2), min: TEXT_MIN, pass: ratio >= TEXT_MIN });
  }
  if (mode === "dark") {
    for (const surface of ["background", "card", "muted"] as const) {
      const ratio = contrast(roles.primary, roles[surface]);
      report.checks.push({ mode, fg: "primary", bg: surface, ratio: +ratio.toFixed(2), min: TEXT_MIN, pass: ratio >= TEXT_MIN });
    }
  }
  const ring = contrast(roles.ring, roles.background);
  report.checks.push({ mode, fg: "ring", bg: "background", ratio: +ring.toFixed(2), min: UI_MIN, pass: ring >= UI_MIN });
}

/** Validate a config and compile it into a complete, rule-checked design system. */
export function buildSystem(input: DesignConfig): DesignSystem {
  const config = parseConfig(input);
  const seed = inGamut(parseColor(config.color.brand));
  const { scale: brand, seedStep } = brandScale(seed);
  const palettes = {
    brand,
    neutral: neutralScale(config.color.neutral),
    danger: statusScale("danger"),
    success: statusScale("success"),
    warning: statusScale("warning"),
  };

  const report: BuildReport = { fixes: [], checks: [], notes: [] };
  const roles = {} as Record<Mode, Roles>;
  for (const mode of ["light", "dark"] as const) {
    const page = config.texture === "minimal" || config.texture === "technical" ? WHITE : palettes.neutral[50];
    roles[mode] = rolesFor(mode, config, palettes, primaryFor(mode, brand, seedStep, palettes.neutral, report, page));
    enforce(mode, roles[mode], palettes.neutral, report);
    collectChecks(mode, roles[mode], report);
  }

  const failed = report.checks.filter((c) => !c.pass);
  if (failed.length) {
    throw new BuildError(
      "Contrast checks failed:\n" + failed.map((c) => `  ${c.mode}: ${c.fg} on ${c.bg} is ${c.ratio}:1 (needs ${c.min}:1)`).join("\n"),
      report,
    );
  }

  const fonts = { sans: config.type.sans, mono: config.type.mono, display: config.type.display };
  const weights = [...new Set([fonts.sans, fonts.mono, fonts.display].flatMap((f) => f?.weights ?? []))].sort();

  return {
    config,
    palettes,
    brand: { seed, step: seedStep },
    roles,
    type: { scale: typeScale(config.type.baseSize, config.type.ratio), fonts, weights },
    spacing: SPACING_STEPS,
    controls: controlHeights(config.density),
    radius: radiusScale(config.shape.radius),
    shadows: shadows(config.texture),
    motion: MOTION[config.motion],
    report,
  };
}
