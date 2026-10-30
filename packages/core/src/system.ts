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
  /**
   * Components hand-written in the system repo (components/), attached by the
   * CLI after it reads the folder. buildSystem never sets this.
   */
  extraComponents?: import("./emit/components.js").ComponentSource[];
  /** Photos in the system repo's images/ folder, with their credits, attached by the CLI. */
  images?: SystemImage[];
}

/** One photo the system ships: a file in images/, what it shows, and who to credit. */
export interface SystemImage {
  file: string;
  alt: string;
  width: number | null;
  height: number | null;
  credit: string;
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
    // Helper text sits on muted panels too, so it starts dark enough to read there (n500 alone is 4.3:1 on n100).
    "muted-foreground": light ? inGamut({ ...n[500], l: 0.525 }) : n[400],
    accent: light ? n[100] : n[800],
    "accent-foreground": light ? n[900] : n[50],
    destructive: light ? p.danger[600] : p.danger[400],
    "destructive-foreground": light ? n[50] : n[950],
    success: light ? inGamut({ ...p.success[600], l: 0.53 }) : p.success[400],
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
 * The brand color stays exact in the mode the system loads in. In the other
 * mode it steps along its own scale until it reads as text on that mode's
 * hardest surface: lighter on dark pages (muted, 4.5:1 on neutral-800), darker
 * on light pages (4.5:1 on neutral-100). A deep blue stays visible in dark
 * mode; a phosphor green in a dark-first system still works in light mode.
 */
function primaryFor(
  mode: Mode,
  brand: Scale,
  seedStep: Step,
  n: Scale,
  report: BuildReport,
  page: Oklch,
  defaultMode: Mode,
): Oklch {
  const seed = brand[seedStep];
  const steps = Object.keys(brand).map(Number) as Step[];

  if (mode === defaultMode) {
    const onPage = contrast(seed, page);
    const panel = mode === "light" ? n[100] : n[800];
    const onPanel = contrast(seed, panel);
    if (onPage < TEXT_MIN) {
      report.notes.push(
        `${mode}: the brand color is ${floor2(onPage)}:1 on the page, too ${mode === "light" ? "light" : "dark"} for text. Use it for fills; links and highlighted text use text-foreground with an underline.`,
      );
    } else if (onPanel < TEXT_MIN) {
      report.notes.push(
        `${mode}: the brand color reads as text on the page (${floor2(onPage)}:1) but not on gray panels such as code blocks (${floor2(onPanel)}:1). Keep text-primary off bg-muted.`,
      );
    }
    return seed;
  }

  const hardest = mode === "dark" ? n[800] : n[100];
  if (contrast(seed, hardest) >= TEXT_MIN) return seed;
  // An ink or paper brand (almost no color) flips to the other end of the grays,
  // the way a black button becomes a white one in dark mode.
  if (seed.c < 0.03) {
    const flipped = mode === "dark" ? n[200] : n[900];
    report.notes.push(`${mode}: primary uses neutral-${mode === "dark" ? 200 : 900}, so the brand's ${mode === "dark" ? "ink" : "paper"} reads as its opposite in ${mode} mode.`);
    return flipped;
  }
  const toward = mode === "dark" ? steps.filter((s) => s < seedStep).sort((a, b) => b - a) : steps.filter((s) => s > seedStep).sort((a, b) => a - b);
  for (const step of toward) {
    if (contrast(brand[step], hardest) >= TEXT_MIN) {
      report.notes.push(
        `${mode}: primary uses brand-${step}, a ${mode === "dark" ? "lighter" : "darker"} step of the brand color, so it reads as text on ${mode} surfaces.`,
      );
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
  const alreadyNoted = report.notes.some((n) => n.startsWith(`${mode}: the brand color is`));
  if (!alreadyNoted && contrast(roles.primary, roles.background) < UI_MIN) {
    report.notes.push(
      `${mode}: the brand color is ${contrast(roles.primary, roles.background).toFixed(1)}:1 against the page, so primary buttons rely on their label and shape. Do not use text-primary for body copy.`,
    );
  }
}

/**
 * `adapted` is true for the mode where the compiler chose the primary color
 * (the one the system doesn't load in). There, primary is guaranteed to read
 * as text; in the default mode the brand stays exact and DESIGN.md says
 * where it can't be used as text.
 */
function collectChecks(mode: Mode, roles: Roles, report: BuildReport, adapted: boolean) {
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
  if (adapted) {
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
  const defaultMode: Mode = config.color.modes === "dark" ? "dark" : config.color.modes === "light" ? "light" : config.color.defaultMode;
  for (const mode of ["light", "dark"] as const) {
    const lightPage = config.texture === "minimal" || config.texture === "technical" ? WHITE : palettes.neutral[50];
    const page = mode === "light" ? lightPage : palettes.neutral[950];
    roles[mode] = rolesFor(mode, config, palettes, primaryFor(mode, brand, seedStep, palettes.neutral, report, page, defaultMode));
    enforce(mode, roles[mode], palettes.neutral, report);
    collectChecks(mode, roles[mode], report, mode !== defaultMode);
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
    type: { scale: typeScale(config.type.baseSize, config.type.ratio, config.art.display), fonts, weights },
    spacing: SPACING_STEPS,
    controls: controlHeights(config.density),
    radius: radiusScale(config.shape.radius),
    shadows: shadows(config.texture),
    motion: MOTION[config.motion],
    report,
  };
}
