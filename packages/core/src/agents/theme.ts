import { toHex } from "../color.js";
import { findFont } from "../fonts.js";
import { isDarkFirst } from "../emit/css.js";
import { ROLE_NAMES, type DesignSystem } from "../system.js";

/**
 * The part of a system that agent tools need outside the system repo: role
 * colors, the brand scale and fonts. It travels in the app's auto-design.json,
 * so the MCP server and the card renderer work in any app that installed the
 * system, without the config.
 */
export interface FontRef {
  family: string;
  fallback: string[];
  weights: number[];
}

export interface AgentTheme {
  product: string;
  texture: string;
  /** Base corner radius in px. */
  radius: number;
  defaultMode: "light" | "dark";
  /** Role colors as hex, per mode. */
  colors: { light: Record<string, string>; dark: Record<string, string> };
  /** The brand scale as hex, 50 to 950. */
  brand: Record<string, string>;
  fonts: { sans: FontRef; mono: FontRef; display?: FontRef };
  /** The type scale in px, by step (xs to 6xl). */
  text: Record<string, number>;
}

const ref = (f: { family: string; fallback: string[]; weights: number[] }): FontRef => ({ family: f.family, fallback: [...f.fallback], weights: [...f.weights] });

export function agentTheme(s: DesignSystem): AgentTheme {
  const colors = { light: {} as Record<string, string>, dark: {} as Record<string, string> };
  for (const mode of ["light", "dark"] as const) {
    for (const role of ROLE_NAMES) colors[mode][role] = toHex(s.roles[mode][role]);
  }
  const brand: Record<string, string> = {};
  for (const [step, c] of Object.entries(s.palettes.brand)) brand[step] = toHex(c);
  return {
    product: s.config.displayName,
    texture: s.config.texture,
    radius: s.config.shape.radius,
    defaultMode: isDarkFirst(s) || s.config.color.modes === "dark" ? "dark" : "light",
    colors,
    brand,
    text: Object.fromEntries(Object.entries(s.type.scale).map(([step, v]) => [step, v.px])),
    fonts: {
      sans: ref(s.type.fonts.sans),
      mono: ref(s.type.fonts.mono),
      ...(s.type.fonts.display ? { display: ref(s.type.fonts.display) } : {}),
    },
  };
}

export function isAgentTheme(x: unknown): x is AgentTheme {
  return !!x && typeof x === "object" && "colors" in x && "brand" in x && "fonts" in x;
}

/** A Google Fonts stylesheet for a theme's faces, for rendering cards and previews in a browser. */
export function themeFontsHref(t: AgentTheme): string {
  const fams = [t.fonts.display, t.fonts.sans, t.fonts.mono]
    .filter((f): f is FontRef => !!f)
    .map((f) => {
      const google = findFont(f.family)?.google ?? f.family.replace(/\s+Variable$/, "");
      const name = google.replace(/ /g, "+");
      const single = f.weights.length === 1 && f.weights[0] === 400;
      return single ? `family=${name}` : `family=${name}:wght@${[...f.weights].sort((a, b) => a - b).join(";")}`;
    });
  return `https://fonts.googleapis.com/css2?${[...new Set(fams)].join("&")}&display=swap`;
}
