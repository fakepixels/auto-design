import type { MotionProfileName, ResolvedConfig, Texture } from "./schema.js";

/* ---------- Type ---------- */

export const TYPE_STEPS = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"] as const;
export type TypeStep = (typeof TYPE_STEPS)[number];

export interface TypeStepValue {
  px: number;
  rem: string;
  lineHeight: number;
  letterSpacing: string;
}

const EXPONENT: Record<TypeStep, number> = {
  xs: -2, sm: -1, base: 0, lg: 1, xl: 2, "2xl": 3, "3xl": 4, "4xl": 5, "5xl": 6, "6xl": 7,
};
const LINE_HEIGHT: Record<TypeStep, number> = {
  xs: 1.5, sm: 1.45, base: 1.5, lg: 1.45, xl: 1.35, "2xl": 1.25, "3xl": 1.2, "4xl": 1.1, "5xl": 1.05, "6xl": 1,
};
const TRACKING: Record<TypeStep, string> = {
  xs: "0.01em", sm: "0em", base: "0em", lg: "-0.005em", xl: "-0.01em",
  "2xl": "-0.015em", "3xl": "-0.02em", "4xl": "-0.025em", "5xl": "-0.03em", "6xl": "-0.03em",
};

/** Smallest size any text may use. */
export const MIN_TEXT_PX = 12;

export function typeScale(baseSize: number, ratio: number): Record<TypeStep, TypeStepValue> {
  const out = {} as Record<TypeStep, TypeStepValue>;
  let previous = 0;
  for (const step of TYPE_STEPS) {
    const raw = baseSize * ratio ** EXPONENT[step];
    let px = raw <= 20 ? Math.round(raw) : Math.round(raw / 2) * 2;
    px = Math.max(px, MIN_TEXT_PX, previous + 1);
    previous = px;
    out[step] = {
      px,
      rem: `${+(px / 16).toFixed(4)}rem`,
      lineHeight: LINE_HEIGHT[step],
      letterSpacing: TRACKING[step],
    };
  }
  return out;
}

/** Display sizes are for marketing surfaces; product UI tops out below them. */
export const PRODUCT_MAX_STEP: TypeStep = "3xl";

/* ---------- Spacing ---------- */

/** Tailwind spacing multipliers (x 0.25rem) the system allows for padding, margin and gaps. */
export const SPACING_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64] as const;

/** Control heights by density, as Tailwind size multipliers. */
export function controlHeights(density: ResolvedConfig["density"]) {
  return density === "compact" ? { sm: 7, md: 8, lg: 9 } : { sm: 8, md: 9, lg: 10 };
}

/* ---------- Radius ---------- */

export function radiusScale(base: number) {
  return {
    base: `${+(base / 16).toFixed(4)}rem`,
    sm: "max(0px, calc(var(--radius) - 4px))",
    md: "max(0px, calc(var(--radius) - 2px))",
    lg: "var(--radius)",
    xl: "calc(var(--radius) + 4px)",
    full: "9999px",
  } as const;
}

/* ---------- Elevation ---------- */

export const SHADOW_STEPS = ["xs", "sm", "md", "lg"] as const;
export type ShadowStep = (typeof SHADOW_STEPS)[number];

/** One shadow layer: offsets, blur and spread in px; black at the given alpha. */
export interface ShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  alpha: number;
}

const L = (y: number, blur: number, spread: number, alpha: number): ShadowLayer => ({ x: 0, y, blur, spread, alpha });

/**
 * Shadows by texture. Technical and editorial systems separate surfaces with
 * borders and space, so only floating layers (popovers, dialogs) cast a shadow.
 * An empty array means no shadow.
 */
export function shadows(texture: Texture): Record<ShadowStep, ShadowLayer[]> {
  switch (texture) {
    case "minimal":
      return {
        xs: [L(1, 2, 0, 0.05)],
        sm: [L(1, 3, 0, 0.07), L(1, 2, -1, 0.07)],
        md: [L(4, 12, -2, 0.08), L(2, 4, -2, 0.06)],
        lg: [L(12, 32, -8, 0.14), L(4, 8, -4, 0.06)],
      };
    case "editorial":
      return { xs: [], sm: [], md: [L(1, 0, 0, 0.04)], lg: [L(16, 40, -16, 0.16)] };
    case "technical":
      return { xs: [], sm: [], md: [], lg: [L(12, 32, -8, 0.32)] };
    case "tactile":
      return {
        xs: [L(1, 2, 0, 0.06)],
        sm: [L(2, 6, -1, 0.08), L(1, 2, 0, 0.04)],
        md: [L(8, 20, -6, 0.12), L(2, 6, -2, 0.06)],
        lg: [L(20, 40, -12, 0.18), L(6, 12, -6, 0.08)],
      };
    case "glass":
      return {
        xs: [L(1, 2, 0, 0.06)],
        sm: [L(2, 8, -2, 0.1)],
        md: [L(8, 32, -8, 0.18)],
        lg: [L(24, 64, -16, 0.24)],
      };
  }
}

export function shadowCss(layers: ShadowLayer[]): string {
  if (!layers.length) return "0 0 #0000";
  return layers.map((s) => `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px oklch(0 0 0 / ${s.alpha})`).join(", ");
}

/* ---------- Motion ---------- */

export interface MotionProfile {
  name: MotionProfileName;
  /** Allowed transition durations in ms. */
  durations: { fast: number; base: number; slow: number };
  easing: { out: [number, number, number, number]; inOut: [number, number, number, number] };
  /** Scale an entering element starts from. 1 means fade only. */
  enterScale: number;
  /** Distance in px an entering element travels. 0 means fade only. */
  enterDistance: number;
  /** Spring for the Motion library, used for drag and layout changes. */
  spring: { duration: number; bounce: number } | null;
  /** Ceiling for any UI transition, in ms. */
  maxDuration: number;
  /**
   * Content and data reveals: counters, charts, text and sections arriving as
   * they scroll into view. Longer than UI motion because nobody is waiting on
   * them; never used for a response to a press.
   */
  reveal: number;
  /** Delay between items in a staggered reveal, in ms. 0 reveals them together. */
  stagger: number;
  /** Distance in px revealed content travels. 0 means fade only. */
  revealDistance: number;
  /** Whether ambient loops (a logo marquee) move at all. */
  ambient: boolean;
}

export const MOTION: Record<MotionProfileName, MotionProfile> = {
  still: {
    name: "still",
    durations: { fast: 100, base: 150, slow: 200 },
    easing: { out: [0.25, 1, 0.5, 1], inOut: [0.65, 0, 0.35, 1] },
    enterScale: 1,
    enterDistance: 0,
    spring: null,
    maxDuration: 250,
    reveal: 200,
    stagger: 0,
    revealDistance: 0,
    ambient: false,
  },
  subtle: {
    name: "subtle",
    durations: { fast: 120, base: 180, slow: 260 },
    easing: { out: [0.23, 1, 0.32, 1], inOut: [0.77, 0, 0.175, 1] },
    enterScale: 0.97,
    enterDistance: 4,
    spring: { duration: 0.3, bounce: 0 },
    maxDuration: 300,
    reveal: 700,
    stagger: 40,
    revealDistance: 8,
    ambient: true,
  },
  expressive: {
    name: "expressive",
    durations: { fast: 150, base: 220, slow: 320 },
    easing: { out: [0.16, 1, 0.3, 1], inOut: [0.87, 0, 0.13, 1] },
    enterScale: 0.95,
    enterDistance: 8,
    spring: { duration: 0.35, bounce: 0.15 },
    maxDuration: 400,
    reveal: 1000,
    stagger: 70,
    revealDistance: 16,
    ambient: true,
  },
};

export const bezier = (b: readonly number[]) => `cubic-bezier(${b.join(", ")})`;
