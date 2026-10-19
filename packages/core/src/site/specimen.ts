import { existsSync, readFileSync } from "node:fs";
import { STEPS, toCss, toHex } from "../color.js";
import { syntaxColors } from "../emit/code.js";
import { isDarkFirst } from "../emit/css.js";
import { fontStack } from "../emit/shared.js";
import { skinFor } from "../emit/components.js";
import { FONTS, pairingOf } from "../fonts.js";
import { SHADOW_STEPS, TYPE_STEPS, bezier, shadowCss } from "../scales.js";
import { ROLE_NAMES, type DesignSystem, type Mode } from "../system.js";

/**
 * Everything the specimen renderer needs to draw a system, as plain CSS
 * values. The renderer (specimen.js + specimen.css) mirrors the generated
 * components class for class, so a preview looks like the product will.
 */
export interface SpecimenData {
  name: string;
  displayName: string;
  description: string;
  texture: string;
  density: string;
  modes: string;
  defaultMode: Mode;
  pairing: string | null;
  roles: Record<Mode, Record<string, string>>;
  code: Record<Mode, Record<string, string>>;
  fonts: { sans: string; mono: string; display: string | null; families: { family: string; google: string; package: string; weights: number[] }[] };
  weights: { body: number; medium: number; strong: number; display: number };
  type: Record<string, { size: string; lh: number; ls: string }>;
  radius: number;
  shadows: Record<string, string>;
  controls: { sm: number; md: number; lg: number };
  pad: number;
  skin: { press: "scale" | "translate" | "none"; raised: boolean; tableMono: boolean; glass: boolean; cardShadow: string; cardBorder: "always" | "dark" | "none" };
  motion: { name: string; fast: number; base: number; slow: number; easeOut: string; easeInOut: string; enterScale: number; enterDistance: number };
  palettes: { brand: { step: number; css: string }[]; neutral: { step: number; css: string }[] };
  seedStep: number;
  seedHex: string;
  report: { passed: number; total: number; fixes: unknown[]; notes: string[] };
}

export function specimenData(s: DesignSystem): SpecimenData {
  const roles = { light: {} as Record<string, string>, dark: {} as Record<string, string> };
  const code = { light: {} as Record<string, string>, dark: {} as Record<string, string> };
  for (const mode of ["light", "dark"] as const) {
    for (const r of ROLE_NAMES) roles[mode][r] = toCss(s.roles[mode][r]);
    const sc = syntaxColors(s, mode);
    for (const [k, v] of Object.entries(sc.tokens)) code[mode][k] = toCss(v);
  }
  const fonts = [s.type.fonts.sans, s.type.fonts.mono, s.type.fonts.display].filter((f) => f !== undefined);
  const families = fonts.map((f) => {
    const entry = Object.values(FONTS).find((e) => e.family === f.family);
    return { family: f.family, google: entry?.google ?? f.family.replace(/ Variable$/, ""), package: f.package ?? "", weights: f.weights };
  });
  const sansWeights = s.type.fonts.sans.weights;
  const pick = (want: number[]) => want.find((w) => sansWeights.includes(w as never)) ?? sansWeights[sansWeights.length - 1]!;
  const skin = skinFor(s);
  const type: SpecimenData["type"] = {};
  for (const step of TYPE_STEPS) {
    const v = s.type.scale[step];
    type[step] = { size: `${v.px}px`, lh: v.lineHeight, ls: v.letterSpacing };
  }
  const shadows: Record<string, string> = {};
  for (const step of SHADOW_STEPS) shadows[step] = shadowCss(s.shadows[step]);
  const passed = s.report.checks.filter((c) => c.pass).length;

  return {
    name: s.config.name,
    displayName: s.config.displayName,
    description: s.config.description,
    texture: s.config.texture,
    density: s.config.density,
    modes: s.config.color.modes,
    defaultMode: s.config.color.modes === "dark" || isDarkFirst(s) ? "dark" : "light",
    pairing: pairingOf(s.config),
    roles,
    code,
    fonts: {
      sans: fontStack(s.type.fonts.sans),
      mono: fontStack(s.type.fonts.mono),
      display: s.type.fonts.display ? fontStack(s.type.fonts.display) : null,
      families,
    },
    weights: {
      body: pick([400]),
      medium: pick([500, 600]),
      strong: pick([600, 700, 500]),
      display: s.type.fonts.display ? s.type.fonts.display.weights[s.type.fonts.display.weights.length - 1]! : pick([600, 700, 500]),
    },
    type,
    radius: s.config.shape.radius,
    shadows,
    controls: { sm: s.controls.sm * 4, md: s.controls.md * 4, lg: s.controls.lg * 4 },
    pad: s.config.density === "compact" ? 16 : 24,
    skin: {
      press: skin.press.includes("translate") ? "translate" : skin.press.includes("scale") ? "scale" : "none",
      raised: skin.raised.trim().length > 0,
      tableMono: skin.tableHead.includes("font-mono"),
      glass: skin.overlay === "glass",
      cardShadow: /shadow-(xs|sm|md)/.exec(skin.card)?.[1] ?? "none",
      cardBorder: skin.card.includes("dark:border-border") ? "dark" : /\bborder\b(?!-)/.test(skin.card) ? "always" : "none",
    },
    motion: {
      name: s.motion.name,
      fast: s.motion.durations.fast,
      base: s.motion.durations.base,
      slow: s.motion.durations.slow,
      easeOut: bezier(s.motion.easing.out),
      easeInOut: bezier(s.motion.easing.inOut),
      enterScale: s.motion.enterScale,
      enterDistance: s.motion.enterDistance,
    },
    palettes: {
      brand: STEPS.map((step) => ({ step, css: toCss(s.palettes.brand[step]) })),
      neutral: STEPS.map((step) => ({ step, css: toCss(s.palettes.neutral[step]) })),
    },
    seedStep: s.brand.step,
    seedHex: toHex(s.palettes.brand[s.brand.step]),
    report: { passed, total: s.report.checks.length, fixes: s.report.fixes, notes: s.report.notes },
  };
}

/** Google Fonts stylesheet for a system's families, for pages served online. */
export function googleFontsHref(data: Pick<SpecimenData, "fonts">): string {
  const fams = data.fonts.families.map((f) => {
    const name = f.google.replace(/ /g, "+");
    const single = f.weights.length === 1 && f.weights[0] === 400;
    return single ? `family=${name}` : `family=${name}:wght@${[...f.weights].sort((a, b) => a - b).join(";")}`;
  });
  return `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap`;
}

function asset(name: string): string {
  for (const rel of [`./${name}`, `./site/${name}`]) {
    const url = new URL(rel, import.meta.url);
    if (existsSync(url)) return readFileSync(url, "utf8");
  }
  throw new Error(`${name} is missing from @auto-design/core`);
}

/** The renderer's stylesheet and script, for pages that embed previews. */
export const specimenAssets = () => ({ css: asset("renderer.css"), js: asset("renderer.js") });

/** The brand animation runtime (one clock for every animation on a stage). */
export const motionRuntime = () => asset("motion-runtime.js");
