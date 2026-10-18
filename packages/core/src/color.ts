import { clampChroma, converter, formatHex, parse, wcagContrast } from "culori";

/**
 * Color engine. Everything is generated in OKLCH so that steps with the same
 * lightness look equally light across hues, then gamut-mapped into sRGB so
 * every value is displayable and contrast math is exact.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha?: number;
}

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Step = (typeof STEPS)[number];
export type Scale = Record<Step, Oklch>;

/** Lightness ramps. Neutral follows Tailwind v4's neutral; chromatic is lighter in the darks. */
const NEUTRAL_L = [0.985, 0.967, 0.922, 0.87, 0.708, 0.556, 0.439, 0.371, 0.269, 0.205, 0.145];
const CHROMATIC_L = [0.975, 0.94, 0.885, 0.815, 0.72, 0.635, 0.555, 0.485, 0.42, 0.36, 0.27];
/** How much of the peak chroma each chromatic step carries. */
const CHROMA_CURVE = [0.12, 0.26, 0.46, 0.7, 0.9, 1, 1, 0.92, 0.8, 0.66, 0.5];
const NEUTRAL_CURVE = [0.3, 0.4, 0.6, 0.8, 1, 1, 1, 0.9, 0.8, 0.7, 0.6];

const toOklch = converter("oklch");

export function parseColor(input: string): Oklch {
  const parsed = parse(input);
  if (!parsed) throw new Error(`Not a valid CSS color: "${input}"`);
  const o = toOklch(parsed);
  return { l: o.l, c: o.c ?? 0, h: o.h ?? 0, alpha: o.alpha };
}

/** Map into the sRGB gamut by reducing chroma, keeping lightness and hue. */
export function inGamut(color: Oklch): Oklch {
  const clamped = clampChroma({ mode: "oklch", l: color.l, c: color.c, h: color.h }, "oklch", "rgb");
  return { l: clamped.l, c: clamped.c ?? 0, h: clamped.h ?? color.h, alpha: color.alpha };
}

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export function toCss(color: Oklch): string {
  const l = round(color.l, 3);
  const c = round(color.c, 3);
  const h = c === 0 ? 0 : round(color.h, 1);
  const a = color.alpha !== undefined && color.alpha < 1 ? ` / ${round(color.alpha * 100, 1)}%` : "";
  return `oklch(${l} ${c} ${h}${a})`;
}

export function toHex(color: Oklch): string {
  return formatHex({ mode: "oklch", l: color.l, c: color.c, h: color.h });
}

/** WCAG 2 contrast ratio between two opaque colors. */
export function contrast(a: Oklch, b: Oklch): number {
  return wcagContrast(
    { mode: "oklch", l: a.l, c: a.c, h: a.h },
    { mode: "oklch", l: b.l, c: b.c, h: b.h },
  );
}

/** Index of the step whose lightness is closest to l. */
function nearestIndex(l: number, ramp: number[]): number {
  let best = 0;
  for (let i = 1; i < ramp.length; i++) {
    if (Math.abs(ramp[i]! - l) < Math.abs(ramp[best]! - l)) best = i;
  }
  return best;
}

export interface BrandScale {
  scale: Scale;
  /** The step that holds the exact brand color. */
  seedStep: Step;
}

/** An 11-step scale around a seed color. The seed lands unchanged on its nearest step. */
export function brandScale(seed: Oklch): BrandScale {
  const seedIndex = nearestIndex(seed.l, CHROMATIC_L);
  const peak = seed.c / CHROMA_CURVE[seedIndex]!;
  const scale = {} as Scale;
  STEPS.forEach((step, i) => {
    scale[step] =
      i === seedIndex
        ? inGamut({ l: seed.l, c: seed.c, h: seed.h })
        : inGamut({ l: CHROMATIC_L[i]!, c: Math.min(peak * CHROMA_CURVE[i]!, 0.37), h: seed.h });
  });
  return { scale, seedStep: STEPS[seedIndex]! };
}

export type NeutralTemperature = "cool" | "neutral" | "warm";

const NEUTRAL_TINT: Record<NeutralTemperature, { h: number; c: number }> = {
  cool: { h: 256, c: 0.012 },
  neutral: { h: 0, c: 0 },
  warm: { h: 70, c: 0.01 },
};

export function neutralScale(temperature: NeutralTemperature): Scale {
  const { h, c } = NEUTRAL_TINT[temperature];
  const scale = {} as Scale;
  STEPS.forEach((step, i) => {
    scale[step] = inGamut({ l: NEUTRAL_L[i]!, c: c * NEUTRAL_CURVE[i]!, h });
  });
  return scale;
}

/** Fixed-hue scales for status colors, so meaning never depends on the brand. */
export function statusScale(kind: "danger" | "success" | "warning"): Scale {
  const spec = { danger: { h: 27, c: 0.22 }, success: { h: 152, c: 0.16 }, warning: { h: 75, c: 0.17 } }[kind];
  const scale = {} as Scale;
  STEPS.forEach((step, i) => {
    scale[step] = inGamut({ l: CHROMATIC_L[i]!, c: spec.c * CHROMA_CURVE[i]!, h: spec.h });
  });
  return scale;
}

export interface ContrastFix {
  role: string;
  against: string;
  mode: "light" | "dark";
  before: number;
  after: number;
  from: string;
  to: string;
}

/**
 * Nudge the foreground's lightness until it reaches the minimum ratio against
 * the background. Returns the adjusted color, or null if no lightness works.
 */
export function ensureContrast(fg: Oklch, bg: Oklch, min: number): Oklch | null {
  if (contrast(fg, bg) >= min) return fg;
  const darken = bg.l > 0.6;
  let candidate = { ...fg };
  for (let i = 0; i < 100; i++) {
    candidate = inGamut({ ...candidate, l: Math.min(1, Math.max(0, candidate.l + (darken ? -0.005 : 0.005))) });
    if (contrast(candidate, bg) >= min) return candidate;
    if (candidate.l <= 0 || candidate.l >= 1) break;
  }
  return null;
}
