import { esc, icons, type TocItem } from "./ui.js";

/** The frame every page sits in: header, docs sidebar, contents rail, footer. */

export interface NavLink {
  title: string;
  /** Path from the site root, like "docs/colors/". "" is the home page. */
  path: string;
  badge?: string;
}

export interface NavGroup {
  title: string;
  links: NavLink[];
}

export interface SiteMeta {
  name: string;
  title: string;
  description: string;
  fontsHref: string | null;
  /** Class that switches the other mode on <html>: "dark" in a light-first system, "light" in a dark-first one. */
  modeClass: "dark" | "light" | null;
  defaultMode: "light" | "dark";
  storageKey: string;
  repoUrl?: string;
  nav: NavGroup[];
  top: NavLink[];
  search: { title: string; group: string; path: string }[];
  generator: string;
}

export interface PageInput {
  /** Path from the site root: "" for home, "docs/colors/" for a docs page. */
  path: string;
  title: string;
  description?: string;
  body: string;
  /** Docs pages get the sidebar and the contents rail. */
  docs?: boolean;
  toc?: TocItem[];
  /** The page holds live examples and needs the hydration script. */
  previews?: boolean;
  /** The page holds brand animations and needs the motion runtime. */
  motion?: boolean;
}

const depth = (path: string) => path.split("/").filter(Boolean).length;
export const rootFor = (path: string) => "../".repeat(depth(path)) || "./";
const link = (root: string, path: string) => (path ? root + path : root);

function header(meta: SiteMeta, page: PageInput, root: string): string {
  const current = (p: string) => (p === "" ? page.path === "" : page.path.startsWith(p) && !(p === "docs/" && page.path.startsWith("docs/components/")));
  return `<header class="sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur">
  <div class="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 md:gap-8 md:px-6">
    <button type="button" data-menu aria-label="Open navigation" class="-ml-1 inline-flex size-8 items-center justify-center rounded-md text-foreground hover:bg-accent md:hidden">${icons.menu}</button>
    <a href="${root}" class="flex items-center gap-2 text-sm font-semibold text-foreground">
      <span aria-hidden="true" class="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">${esc(meta.name.charAt(0).toUpperCase())}</span>
      <span>${esc(meta.name)}</span>
    </a>
    <nav class="hidden items-center gap-6 text-sm md:flex" aria-label="Main">
      ${meta.top
        .map(
          (l) =>
            `<a href="${link(root, l.path)}" class="transition-colors hover:text-foreground ${current(l.path) ? "text-foreground" : "text-muted-foreground"}"${current(l.path) ? ' aria-current="page"' : ""}>${esc(l.title)}</a>`,
        )
        .join("")}
    </nav>
    <div class="ml-auto flex items-center gap-1">
      <button type="button" data-search class="mr-1 hidden h-8 w-56 items-center gap-2 rounded-md border bg-muted px-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:flex lg:w-64">
        ${icons.search}<span class="flex-1 text-left">Search</span><kbd class="rounded-sm border bg-background px-1.5 font-mono text-xs">⌘K</kbd>
      </button>
      <button type="button" data-search aria-label="Search" class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:hidden">${icons.search}</button>
      ${meta.repoUrl ? `<a href="${esc(meta.repoUrl)}" target="_blank" rel="noreferrer" aria-label="Source on GitHub" class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">${icons.github}</a>` : ""}
      ${meta.modeClass ? `<button type="button" data-mode-toggle aria-label="Switch color mode" class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><span class="dark:hidden">${icons.moon}</span><span class="hidden dark:inline">${icons.sun}</span></button>` : ""}
    </div>
  </div>
</header>`;
}

function sidebar(meta: SiteMeta, page: PageInput, root: string): string {
  return meta.nav
    .map(
      (g) => `<div class="pb-6">
    <p class="mb-1 px-2 text-xs font-medium text-muted-foreground">${esc(g.title)}</p>
    <ul class="grid gap-px">
      ${g.links
        .map((l) => {
          const active = l.path === page.path;
          return `<li><a href="${link(root, l.path)}" class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${active ? "bg-accent font-medium text-accent-foreground" : "text-foreground hover:bg-accent hover:text-accent-foreground"}"${active ? ' aria-current="page"' : ""}>${esc(l.title)}${l.badge ? `<span class="rounded-sm bg-muted px-1.5 text-xs text-muted-foreground">${esc(l.badge)}</span>` : ""}</a></li>`;
        })
        .join("")}
    </ul>
  </div>`,
    )
    .join("\n");
}

function tocRail(toc: TocItem[] | undefined): string {
  if (!toc || toc.length < 2) return "";
  return `<nav aria-label="On this page" class="hidden xl:block">
    <div class="sticky top-24">
      <p class="mb-2 text-sm font-medium">On this page</p>
      <ul class="grid gap-1.5 text-sm">
        ${toc.map((t) => `<li><a href="#${esc(t.id)}" data-toc class="${t.level > 2 ? "pl-3 " : ""}text-muted-foreground transition-colors hover:text-foreground">${esc(t.text)}</a></li>`).join("")}
      </ul>
    </div>
  </nav>`;
}

function footer(meta: SiteMeta): string {
  return `<footer class="border-t">
  <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground md:px-6">
    <p>${esc(meta.title)}. Built from design.config.ts with <a href="https://github.com/fakepixels/auto-design" class="font-medium text-foreground underline-offset-4 hover:underline" target="_blank" rel="noreferrer">auto-design</a>.</p>
    ${meta.repoUrl ? `<a href="${esc(meta.repoUrl)}" class="font-medium text-foreground underline-offset-4 hover:underline" target="_blank" rel="noreferrer">Source</a>` : ""}
  </div>
</footer>`;
}

/** Sets the color mode before first paint, so a reload never flashes the other mode. */
function modeScript(meta: SiteMeta): string {
  if (!meta.modeClass) return "";
  return `<script>(function(){var c=${JSON.stringify(meta.modeClass)},d=${JSON.stringify(meta.defaultMode)},m=null;try{m=localStorage.getItem(${JSON.stringify(meta.storageKey)})}catch(e){}var on=(m||d)!==d;document.documentElement.classList.toggle(c,on)})()</script>`;
}

export function renderPage(meta: SiteMeta, page: PageInput): string {
  const root = rootFor(page.path);
  const title = page.path === "" ? meta.title : `${page.title} · ${meta.title}`;
  const content = page.docs
    ? `<div class="mx-auto max-w-7xl px-4 md:px-6">
  <div class="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
    <aside class="sticky top-14 hidden h-[calc(100dvh-3.5rem)] overflow-y-auto py-8 pr-2 md:block" aria-label="Docs">${sidebar(meta, page, root)}</aside>
    <div class="min-w-0 py-8 md:py-10 xl:grid xl:grid-cols-[minmax(0,1fr)_12rem] xl:gap-12">
      <main id="content" class="min-w-0 max-w-3xl">
        <h1 class="text-3xl font-semibold tracking-tight">${esc(page.title)}</h1>
        ${page.description ? `<p class="mt-2 text-lg text-muted-foreground">${esc(page.description)}</p>` : ""}
        <div class="mt-8">${page.body}</div>
      </main>
      ${tocRail(page.toc)}
    </div>
  </div>
</div>`
    : `<main id="content">${page.body}</main>`;
  // Phones get the same navigation on every page, home and Motion included: the top links, then the docs.
  const sheet = `<div data-sheet hidden class="fixed inset-0 z-50 md:hidden">
  <div data-sheet-close class="absolute inset-0 bg-overlay"></div>
  <div class="absolute inset-y-0 left-0 w-72 max-w-full overflow-y-auto border-r bg-background p-4 shadow-lg">
    <div class="mb-4 flex items-center justify-between">
      <span class="text-sm font-semibold">${esc(meta.name)}</span>
      <button type="button" data-sheet-close aria-label="Close navigation" class="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent">${icons.close}</button>
    </div>
    <ul class="mb-6 grid gap-px">${meta.top.map((l) => `<li><a href="${link(root, l.path)}" class="block rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent">${esc(l.title)}</a></li>`).join("")}</ul>
    ${sidebar(meta, page, root)}
  </div>
</div>`;

  return `<!doctype html>
<html lang="en" data-root="${root}"${meta.modeClass ? ` data-mode-class="${meta.modeClass}" data-default-mode="${meta.defaultMode}" data-storage-key="${esc(meta.storageKey)}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description || meta.description)}">
<meta name="generator" content="${esc(meta.generator)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(page.description || meta.description)}">
${modeScript(meta)}
${meta.fontsHref ? `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${esc(meta.fontsHref)}">` : ""}
<link rel="stylesheet" href="${root}_site/site.css">
<script type="module" src="${root}_site/site.js"></script>
${page.previews ? `<script type="module" src="${root}_site/previews.js"></script>` : ""}
${page.motion ? `<link rel="stylesheet" href="${root}_site/motion.css">
<script defer src="${root}_site/motion-runtime.js"></script>
<script defer src="${root}_site/motion-templates.js"></script>
<script defer src="${root}_site/motion-player.js"></script>` : ""}
</head>
<body class="min-h-dvh bg-background font-sans text-foreground antialiased">
<a href="#content" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md">Skip to content</a>
${header(meta, page, root)}
${content}
${sheet}
${footer(meta)}
<div data-palette hidden class="fixed inset-0 z-50">
  <div data-palette-close class="absolute inset-0 bg-overlay"></div>
  <div role="dialog" aria-modal="true" aria-label="Search" class="relative mx-auto mt-24 w-full max-w-lg overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
    <div class="flex items-center gap-2 border-b px-4">${icons.search}<input data-palette-input type="search" placeholder="Search pages and components" aria-label="Search pages and components" class="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"></div>
    <ul data-palette-list role="listbox" class="max-h-80 overflow-y-auto p-2"></ul>
    <p data-palette-empty hidden class="px-4 py-6 text-center text-sm text-muted-foreground">No results.</p>
  </div>
</div>
<script type="application/json" id="search-index">${JSON.stringify(meta.search).replace(/</g, "\\u003c")}</script>
</body>
</html>
`;
}
