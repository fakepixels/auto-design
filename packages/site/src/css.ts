import { createRequire } from "node:module";
import { dirname } from "node:path";
import { codeLayer, emitCss, isDarkFirst, type DesignSystem } from "@auto-design/core";
import { compile, optimize } from "@tailwindcss/node";

const require = createRequire(import.meta.url);

/**
 * The site's stylesheet: the system's own CSS compiled by real Tailwind, so the
 * site can only use classes that exist in the system. Off-system classes in
 * the site's markup simply produce nothing, the same as in an app.
 */

/** Class candidates in markup and source, the way Tailwind's scanner reads them. */
export function candidates(sources: string[]): string[] {
  const out = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/[^\s"'`<>{}\\]+/g)) {
      const t = m[0].replace(/[,;)]+$/, "");
      if (t.length < 2 || t.length > 160) continue;
      if (/^[a-z@!\[-]/.test(t) || /^[a-z0-9-]+:/.test(t)) out.add(t);
    }
  }
  return [...out];
}

/** Rules the site needs beyond utilities: code colors in both modes and anchor offsets. */
function siteLayer(s: DesignSystem): string {
  const dark = isDarkFirst(s) ? ":root:not(.light)" : ":root.dark";
  return `${s.config.surfaces.includes("code") ? "" : codeLayer(dark)}
@layer base {
  html { scroll-padding-top: 5rem; }
  [hidden] { display: none !important; }
  .shiki { margin: 0; }
  .shiki code { counter-reset: line; }
  ::selection { background: color-mix(in oklab, var(--primary) 22%, transparent); }
}`;
}

export async function siteCss(s: DesignSystem, sources: string[]): Promise<string> {
  const base = dirname(require.resolve("tailwindcss/package.json"));
  const input = `@import "tailwindcss";\n${emitCss(s)}\n${siteLayer(s)}\n`;
  const compiler = await compile(input, { base, onDependency() {} });
  const css = compiler.build(candidates(sources));
  try {
    return optimize(css, { minify: true }).code;
  } catch {
    return css;
  }
}
