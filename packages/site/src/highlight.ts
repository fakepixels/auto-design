import { codeTheme, type DesignSystem } from "@auto-design/core";
import { createHighlighter, type BundledLanguage, type Highlighter, type ThemeRegistration } from "shiki";

/** Code on the site is highlighted with the system's own syntax colors, in both modes. */
export interface Highlight {
  (code: string, lang?: string): string;
}

const LANGS: BundledLanguage[] = ["tsx", "ts", "jsx", "js", "bash", "json", "css", "md", "html", "yaml"];
const ALIASES: Record<string, BundledLanguage> = { sh: "bash", shell: "bash", typescript: "ts", javascript: "js", markdown: "md", yml: "yaml" };

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function highlighter(s: DesignSystem): Promise<Highlight> {
  const light = { ...(codeTheme(s, "light") as ThemeRegistration), name: "system-light" };
  const dark = { ...(codeTheme(s, "dark") as ThemeRegistration), name: "system-dark" };
  const h: Highlighter = await createHighlighter({ themes: [light, dark], langs: LANGS });
  return (code, lang = "tsx") => {
    const l = (ALIASES[lang] ?? lang) as BundledLanguage;
    if (!LANGS.includes(l)) return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
    return h.codeToHtml(code.replace(/\n+$/, ""), { lang: l, themes: { light: "system-light", dark: "system-dark" }, defaultColor: false });
  };
}
