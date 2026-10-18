import { toCss } from "../color.js";
import { SHADOW_STEPS, TYPE_STEPS, bezier, shadowCss } from "../scales.js";
import { ROLE_NAMES, type DesignSystem, type Mode } from "../system.js";
import { WEIGHT_NAMES, fontStack, header } from "./shared.js";

/**
 * Tailwind namespaces the system owns completely. Resetting them removes
 * Tailwind's defaults, so off-system classes like bg-blue-500, font-bold or
 * shadow-2xl stop existing instead of merely being discouraged.
 */
export const LOCKED_NAMESPACES = [
  "--color-*",
  "--font-*",
  "--text-*",
  "--font-weight-*",
  "--tracking-*",
  "--leading-*",
  "--radius-*",
  "--shadow-*",
  "--inset-shadow-*",
  "--drop-shadow-*",
  "--text-shadow-*",
  "--blur-*",
  "--ease-*",
  "--animate-*",
] as const;

/** Values that go inside @theme: everything except colors, which map to mode variables. */
export function themeTokens(s: DesignSystem): Record<string, string> {
  const t: Record<string, string> = {};
  t["--font-sans"] = fontStack(s.type.fonts.sans);
  t["--font-mono"] = fontStack(s.type.fonts.mono);
  if (s.type.fonts.display) t["--font-display"] = fontStack(s.type.fonts.display);

  for (const step of TYPE_STEPS) {
    const v = s.type.scale[step];
    t[`--text-${step}`] = v.rem;
    t[`--text-${step}--line-height`] = String(v.lineHeight);
    t[`--text-${step}--letter-spacing`] = v.letterSpacing;
  }
  for (const w of s.type.weights) t[`--font-weight-${WEIGHT_NAMES[w]}`] = String(w);

  t["--tracking-tight"] = "-0.02em";
  t["--tracking-normal"] = "0em";
  t["--tracking-wide"] = "0.04em";
  t["--leading-none"] = "1";
  t["--leading-tight"] = "1.25";
  t["--leading-snug"] = "1.4";
  t["--leading-normal"] = "1.5";
  t["--leading-relaxed"] = "1.65";

  t["--radius-sm"] = s.radius.sm;
  t["--radius-md"] = s.radius.md;
  t["--radius-lg"] = s.radius.lg;
  t["--radius-xl"] = s.radius.xl;

  for (const step of SHADOW_STEPS) t[`--shadow-${step}`] = shadowCss(s.shadows[step]);

  t["--ease-out"] = bezier(s.motion.easing.out);
  t["--ease-in-out"] = bezier(s.motion.easing.inOut);
  t["--animate-enter"] = "ad-enter var(--duration-base) var(--ease-out) both";
  t["--animate-exit"] = "ad-exit var(--duration-fast) var(--ease-in-out) both";
  t["--animate-pulse"] = "ad-pulse 2s var(--ease-in-out) infinite";
  t["--animate-spin"] = "ad-spin 1s linear infinite";
  return t;
}

/** Variables that differ by mode or are read at runtime. */
export function rootTokens(s: DesignSystem, mode: Mode): Record<string, string> {
  const v: Record<string, string> = {};
  for (const role of ROLE_NAMES) v[`--${role}`] = toCss(s.roles[mode][role]);
  return v;
}

export function staticRootTokens(s: DesignSystem): Record<string, string> {
  return {
    "--radius": s.radius.base,
    "--duration-fast": `${s.motion.durations.fast}ms`,
    "--duration-base": `${s.motion.durations.base}ms`,
    "--duration-slow": `${s.motion.durations.slow}ms`,
    "--enter-scale": String(s.motion.enterScale),
    "--enter-distance": `${s.motion.enterDistance}px`,
  };
}

const block = (selector: string, vars: Record<string, string>, indent = "  ") =>
  `${selector} {\n${Object.entries(vars)
    .map(([k, v]) => `${indent}${k}: ${v};`)
    .join("\n")}\n}`;

export const KEYFRAMES = `@keyframes ad-enter {
  from {
    opacity: 0;
    transform: translateY(var(--enter-distance)) scale(var(--enter-scale));
  }
}

@keyframes ad-exit {
  to {
    opacity: 0;
    transform: scale(var(--enter-scale));
  }
}

@keyframes ad-pulse {
  50% {
    opacity: 0.4;
  }
}

@keyframes ad-spin {
  to {
    transform: rotate(360deg);
  }
}`;

export const BASE_LAYER = `@layer base {
  *,
  ::before,
  ::after {
    border-color: var(--color-border);
  }
  html {
    color-scheme: light;
    -webkit-text-size-adjust: 100%;
  }
  html.dark {
    color-scheme: dark;
  }
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: var(--text-base--line-height);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  h1, h2, h3, h4 {
    text-wrap: balance;
  }
  p, li, figcaption {
    text-wrap: pretty;
  }
  code, kbd, pre, samp {
    font-family: var(--font-mono);
  }
  :focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
  ::selection {
    background-color: color-mix(in oklab, var(--color-primary) 22%, transparent);
  }
}`;

export const REDUCED_MOTION = `@media (prefers-reduced-motion: reduce) {
  :root {
    --enter-scale: 1;
    --enter-distance: 0px;
  }
}`;

/** The one CSS file an app imports after Tailwind. */
export function emitCss(s: DesignSystem): string {
  const modes = s.config.color.modes;
  const rootMode: Mode = modes === "dark" ? "dark" : "light";

  const colorMap: Record<string, string> = {};
  for (const role of ROLE_NAMES) colorMap[`--color-${role}`] = `var(--${role})`;
  colorMap["--color-transparent"] = "transparent";
  colorMap["--color-current"] = "currentColor";

  const parts = [
    header(s, "css"),
    "@custom-variant dark (&:where(.dark, .dark *));",
    `@theme {\n  /* Locked: Tailwind's defaults for these namespaces are removed. */\n${LOCKED_NAMESPACES.map((n) => `  ${n}: initial;`).join("\n")}\n\n${Object.entries(
      themeTokens(s),
    )
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n")}\n}`,
    block("@theme inline", colorMap),
    // Doubled selectors outrank a plain :root or .dark left in an app's own CSS,
    // so the system's values win regardless of import order.
    block(":root:root", { ...staticRootTokens(s), ...rootTokens(s, rootMode) }),
  ];
  if (modes === "both") parts.push(block(":root.dark", rootTokens(s, "dark")));
  parts.push(KEYFRAMES, REDUCED_MOTION, BASE_LAYER);
  return parts.join("\n\n") + "\n";
}
