import { toCss } from "../color.js";
import { SHADOW_STEPS, TYPE_STEPS, bezier, shadowCss } from "../scales.js";
import { ROLE_NAMES, type DesignSystem, type Mode } from "../system.js";
import { WEIGHT_NAMES, fontStack, header } from "./shared.js";
import { mcpLayer } from "../agents/mcp-app.js";

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
  t["--animate-fade-in"] = "ad-fade-in var(--duration-base) var(--ease-out) both";
  t["--animate-fade-out"] = "ad-fade-out var(--duration-fast) var(--ease-in-out) both";
  t["--animate-pulse"] = "ad-pulse 2s var(--ease-in-out) infinite";
  t["--animate-spin"] = "ad-spin 1s linear infinite";
  // Content reveals: text, sections, charts and counters arriving in view.
  t["--animate-reveal"] = "ad-reveal var(--duration-reveal) var(--ease-out) both";
  t["--animate-grow"] = "ad-grow var(--duration-reveal) var(--ease-out) both";
  t["--animate-draw"] = "ad-draw var(--duration-reveal) var(--ease-out) both";
  // Disclosure and sheets: height and edge travel, with the system's easing.
  t["--animate-accordion-down"] = "ad-accordion-down var(--duration-base) var(--ease-out)";
  t["--animate-accordion-up"] = "ad-accordion-up var(--duration-fast) var(--ease-in-out)";
  t["--animate-sheet-in"] = "ad-sheet-in var(--duration-slow) var(--ease-out) both";
  t["--animate-sheet-out"] = "ad-sheet-out var(--duration-base) var(--ease-in-out) both";
  t["--animate-indeterminate"] = "ad-indeterminate 1.4s var(--ease-in-out) infinite";
  // Ambient: the only looping motion, for logo strips and tickers on marketing pages.
  t["--animate-marquee"] = "ad-marquee var(--marquee-duration, 40s) linear infinite";
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
    "--duration-reveal": `${s.motion.reveal}ms`,
    "--stagger": `${s.motion.stagger}ms`,
    "--reveal-distance": `${s.motion.revealDistance}px`,
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

@keyframes ad-fade-in {
  from {
    opacity: 0;
  }
}

@keyframes ad-fade-out {
  to {
    opacity: 0;
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
}

@keyframes ad-reveal {
  from {
    opacity: 0;
    transform: translateY(var(--reveal-distance));
  }
}

/* Data grows from its baseline: bars in a chart, a filling meter. Set the origin with origin-bottom or origin-left. */
@keyframes ad-grow {
  from {
    transform: scale(var(--grow-x, 1), var(--grow-y, 0));
  }
}

/* Strokes draw along their length. Give the path pathLength="1" and stroke-dasharray="1". */
@keyframes ad-draw {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes ad-accordion-down {
  from {
    height: 0;
  }
  to {
    height: var(--radix-accordion-content-height, var(--radix-collapsible-content-height, auto));
  }
}

@keyframes ad-accordion-up {
  from {
    height: var(--radix-accordion-content-height, var(--radix-collapsible-content-height, auto));
  }
  to {
    height: 0;
  }
}

/* Sheets travel from the edge set in --sheet-from (translateX(100%) for a right sheet). */
@keyframes ad-sheet-in {
  from {
    transform: var(--sheet-from);
  }
}

@keyframes ad-sheet-out {
  to {
    transform: var(--sheet-from);
  }
}

@keyframes ad-indeterminate {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
}

@keyframes ad-marquee {
  to {
    transform: translateX(-50%);
  }
}

/* Page transitions with the View Transitions API use the same timing as everything else. */
::view-transition-old(root) {
  animation: ad-fade-out var(--duration-fast) var(--ease-in-out) both;
}

::view-transition-new(root) {
  animation: ad-enter var(--duration-base) var(--ease-out) both;
}

::view-transition-group(*) {
  animation-duration: var(--duration-slow);
  animation-timing-function: var(--ease-in-out);
}`;

export const baseLayer = (darkFirst: boolean) => `@layer base {
  *,
  ::before,
  ::after {
    border-color: var(--color-border);
  }
  html {
    color-scheme: ${darkFirst ? "dark" : "light"};
    -webkit-text-size-adjust: 100%;
  }
  html.${darkFirst ? "light" : "dark"} {
    color-scheme: ${darkFirst ? "light" : "dark"};
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

/** Shiki dual-theme output: spans carry --shiki-light and --shiki-dark; this picks one. */
export const codeLayer = (dark: string) => `@layer components {
  .shiki,
  .shiki span {
    color: var(--shiki-light);
    font-style: var(--shiki-light-font-style);
  }
  ${dark} .shiki,
  ${dark} .shiki span {
    color: var(--shiki-dark);
    font-style: var(--shiki-dark-font-style);
  }
  .shiki {
    background-color: transparent;
  }
}`;

export const REDUCED_MOTION = `@media (prefers-reduced-motion: reduce) {
  :root {
    --enter-scale: 1;
    --enter-distance: 0px;
    --reveal-distance: 0px;
    --stagger: 0ms;
  }
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}`;

/** True when the system loads in dark mode and light is the opt-in class. */
export function isDarkFirst(s: DesignSystem): boolean {
  return s.config.color.modes === "both" && s.config.color.defaultMode === "dark";
}

/**
 * Texture utilities. Glass gets a frosted surface built in layers: a solid
 * fallback first, frosting only where backdrop-filter is supported, and a
 * tinted backdrop so the frosting has something to show. Values inside
 * -webkit-backdrop-filter are literal because Safari doesn't resolve custom
 * properties there.
 */
export function textureLayer(s: DesignSystem): string {
  if (s.config.texture !== "glass") return "";
  return `/* Glass is chrome, never content: nav bars, sheets, dialogs and popovers only. */
@utility glass {
  background-color: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--glass-border);
  box-shadow: inset 0 1px 0 0 var(--glass-highlight), var(--shadow-md);
  @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
    background-color: var(--glass);
    -webkit-backdrop-filter: blur(20px) saturate(1.6);
    backdrop-filter: blur(20px) saturate(1.6);
  }
}

@utility bg-backdrop {
  background-color: var(--background);
  background-image:
    radial-gradient(55% 45% at 12% 8%, color-mix(in oklab, var(--primary) 26%, transparent), transparent 70%),
    radial-gradient(45% 45% at 88% 22%, color-mix(in oklab, var(--chart-2) 24%, transparent), transparent 70%),
    radial-gradient(60% 50% at 50% 100%, color-mix(in oklab, var(--chart-4) 20%, transparent), transparent 70%);
  background-attachment: fixed;
}`;
}

function glassVars(s: DesignSystem): Record<string, string> {
  if (s.config.texture !== "glass") return {};
  return {
    "--glass": "color-mix(in oklab, var(--popover) 62%, transparent)",
    "--glass-border": "color-mix(in oklab, var(--foreground) 10%, transparent)",
    "--glass-highlight": "color-mix(in oklab, white 45%, transparent)",
  };
}

/** The one CSS file an app imports after Tailwind. */
export function emitCss(s: DesignSystem): string {
  const modes = s.config.color.modes;
  const darkFirst = isDarkFirst(s);
  const rootMode: Mode = modes === "dark" || darkFirst ? "dark" : "light";

  const colorMap: Record<string, string> = {};
  for (const role of ROLE_NAMES) colorMap[`--color-${role}`] = `var(--${role})`;
  colorMap["--color-transparent"] = "transparent";
  colorMap["--color-current"] = "currentColor";

  // In a dark-first system, dark: utilities apply unless <html class="light">.
  const variant = darkFirst
    ? "@custom-variant dark (&:where(:root:not(.light), :root:not(.light) *));"
    : "@custom-variant dark (&:where(.dark, .dark *));";

  const parts = [
    header(s, "css"),
    variant,
    `@theme {\n  /* Locked: Tailwind's defaults for these namespaces are removed. */\n${LOCKED_NAMESPACES.map((n) => `  ${n}: initial;`).join("\n")}\n\n${Object.entries(
      themeTokens(s),
    )
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n")}\n}`,
    block("@theme inline", colorMap),
    // Doubled selectors outrank a plain :root or .dark left in an app's own CSS,
    // so the system's values win regardless of import order.
    block(":root:root", { ...staticRootTokens(s), ...glassVars(s), ...rootTokens(s, rootMode) }),
  ];
  if (modes === "both") {
    parts.push(darkFirst ? block(":root.light", rootTokens(s, "light")) : block(":root.dark", rootTokens(s, "dark")));
  }
  parts.push(KEYFRAMES, REDUCED_MOTION, baseLayer(darkFirst));
  const texture = textureLayer(s);
  if (texture) parts.push(texture);
  if (s.config.surfaces.includes("code")) parts.push(codeLayer(darkFirst ? ":root:not(.light)" : ":root.dark"));
  if (s.config.surfaces.includes("mcp-apps")) parts.push(mcpLayer(s, darkFirst));
  return parts.join("\n\n") + "\n";
}
