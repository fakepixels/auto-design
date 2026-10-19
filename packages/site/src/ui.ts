/** Small HTML helpers shared by the site's pages. Classes are the system's own Tailwind utilities. */

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const icons = {
  copy: '<svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  check: '<svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  sun: '<svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a6.6 6.6 0 0 0 10.6 10.6z"/></svg>',
  menu: '<svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  close: '<svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  search: '<svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  github: '<svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>',
};

/** A copy button. The site script copies data-copy, or the text of the code next to it. */
export const copyButton = (text: string, label = "Copy code") =>
  `<button type="button" data-copy="${esc(text)}" aria-label="${esc(label)}" class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">${icons.copy}</button>`;

/** Highlighted code in a quiet panel, with a copy button. */
export const codePanel = (highlighted: string, raw: string, opts: { maxHeight?: boolean } = {}) =>
  `<div class="group relative rounded-lg border bg-muted">
  <div class="absolute right-2 top-2 z-10">${copyButton(raw)}</div>
  <div class="overflow-auto p-4 pr-12 font-mono text-sm leading-relaxed${opts.maxHeight === false ? "" : " max-h-128"} [&_pre]:outline-none">${highlighted}</div>
</div>`;

/** A one-line command with a copy button. data-origin spans are filled with the site's address. */
export const command = (html: string, raw: string) =>
  `<div class="flex items-center gap-2 rounded-lg border bg-muted py-1 pl-4 pr-1">
  <code class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-1.5 font-mono text-sm">${html}</code>
  ${copyButton(raw, "Copy command")}
</div>`;

/** Plain tabs, driven by the site script. Panels after the first start hidden. */
export function tabs(id: string, items: { label: string; panel: string }[], opts: { className?: string } = {}): string {
  return `<div data-tabs="${esc(id)}" class="${opts.className ?? ""}">
  <div role="tablist" class="flex items-center gap-4 border-b">
    ${items
      .map(
        (t, i) =>
          `<button type="button" role="tab" data-tab="${i}" aria-selected="${i === 0}" class="-mb-px border-b-2 border-transparent px-0.5 pb-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground">${esc(t.label)}</button>`,
      )
      .join("")}
  </div>
  ${items.map((t, i) => `<div role="tabpanel" data-panel="${i}" class="pt-4"${i ? " hidden" : ""}>${t.panel}</div>`).join("\n")}
</div>`;
}

export const h2 = (id: string, text: string) =>
  `<h2 id="${esc(id)}" class="mt-12 scroll-mt-20 border-b pb-2 text-xl font-semibold tracking-tight first:mt-0">${esc(text)}</h2>`;

export const h3 = (id: string, text: string) => `<h3 id="${esc(id)}" class="mt-8 scroll-mt-20 text-lg font-semibold tracking-tight">${esc(text)}</h3>`;

export const p = (html: string) => `<p class="leading-relaxed [&:not(:first-child)]:mt-4">${html}</p>`;

export const inlineCode = (s: string) => `<code class="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-sm">${esc(s)}</code>`;
