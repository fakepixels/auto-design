import { Marked, type Tokens } from "marked";
import type { Highlight } from "./highlight.js";
import { codePanel, esc, slugify, type TocItem } from "./ui.js";

/**
 * Markdown pages from the system repo's docs/ folder, drawn with the system's
 * own utilities so they match the generated pages.
 */
export function renderMarkdown(src: string, highlight: Highlight): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const used = new Map<string, number>();
  const idFor = (text: string) => {
    const base = slugify(text) || "section";
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, t: Tokens.Heading) {
        const inner = this.parser.parseInline(t.tokens);
        const plain = t.text.replace(/[`*_]/g, "");
        if (t.depth === 1) return `<h2 class="mt-12 scroll-mt-20 text-2xl font-semibold tracking-tight first:mt-0">${inner}</h2>`;
        const id = idFor(plain);
        if (t.depth <= 3) toc.push({ id, text: plain, level: t.depth });
        return t.depth === 2
          ? `<h2 id="${id}" class="mt-12 scroll-mt-20 border-b pb-2 text-xl font-semibold tracking-tight first:mt-0">${inner}</h2>`
          : `<h${t.depth} id="${id}" class="mt-8 scroll-mt-20 text-lg font-semibold tracking-tight">${inner}</h${t.depth}>`;
      },
      paragraph(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, t: Tokens.Paragraph) {
        return `<p class="leading-relaxed [&:not(:first-child)]:mt-4">${this.parser.parseInline(t.tokens)}</p>`;
      },
      code(t: Tokens.Code) {
        return `<div class="mt-6">${codePanel(highlight(t.text, (t.lang ?? "").split(/\s/)[0] || "txt"), t.text)}</div>`;
      },
      codespan(t: Tokens.Codespan) {
        return `<code class="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-sm">${t.text}</code>`;
      },
      link(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, t: Tokens.Link) {
        const ext = /^https?:\/\//.test(t.href);
        return `<a href="${esc(t.href)}" class="font-medium text-primary underline underline-offset-4"${ext ? ' target="_blank" rel="noreferrer"' : ""}>${this.parser.parseInline(t.tokens)}</a>`;
      },
      blockquote(this: { parser: { parse(t: Tokens.Generic[]): string } }, t: Tokens.Blockquote) {
        return `<blockquote class="mt-6 border-l-2 pl-6 text-muted-foreground">${this.parser.parse(t.tokens)}</blockquote>`;
      },
      hr() {
        return `<hr class="my-10 border-t" />`;
      },
      image(t: Tokens.Image) {
        return `<img src="${esc(t.href)}" alt="${esc(t.text)}" class="mt-6 rounded-lg border" loading="lazy" />`;
      },
    },
  });

  // Lists and tables: let marked draw them, then add classes.
  const html = (marked.parse(src, { async: false }) as string)
    .replace(/<ul>/g, '<ul class="my-4 ml-6 list-disc [&>li]:mt-2">')
    .replace(/<ol>/g, '<ol class="my-4 ml-6 list-decimal [&>li]:mt-2">')
    .replace(/<table>/g, '<div class="my-6 w-full overflow-x-auto rounded-lg border"><table class="w-full text-sm">')
    .replace(/<\/table>/g, "</table></div>")
    .replace(/<th(\s[^>]*)?>/g, (_m, a = "") => `<th${a} class="border-b bg-muted px-4 py-2 text-left font-medium">`)
    .replace(/<td(\s[^>]*)?>/g, (_m, a = "") => `<td${a} class="border-b px-4 py-2">`);
  return { html, toc };
}
