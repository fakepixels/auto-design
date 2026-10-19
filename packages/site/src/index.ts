import { existsSync, readFileSync } from "node:fs";
import {
  componentExamples,
  componentSources,
  emitDesignMd,
  googleFontsHref,
  isDarkFirst,
  specimenData,
  type ComponentExample,
  type DesignSystem,
  type SpecimenCopy,
} from "@auto-design/core";
import { renderExamples } from "./bundle.js";
import { siteCss } from "./css.js";
import { highlighter } from "./highlight.js";
import {
  agentsPage,
  colorsPage,
  componentPage,
  componentsIndexPage,
  customPage,
  guardrailsPage,
  homePage,
  installationPage,
  introductionPage,
  motionPage,
  shapePage,
  typographyPage,
  voicePage,
  type PageContext,
} from "./pages.js";
import { homeMotion, motionPages } from "./motion.js";
import { renderPage, rootFor, type NavGroup, type PageInput, type SiteMeta } from "./shell.js";

export { candidates } from "./css.js";
export { renderMarkdown } from "./markdown.js";

/**
 * The design site for one system: a home page, docs for every foundation, and
 * a page per component with live examples drawn by the real components. It is
 * static HTML with small islands of React, built into public/ next to the
 * registry, so it hosts anywhere the registry does.
 */

export interface SiteDoc {
  slug: string;
  title: string;
  description: string;
  order: number;
  body: string;
}

export interface SiteInput {
  /** The system repo: its node_modules are searched first when bundling examples. */
  root: string;
  /** The system, with the repo's own components attached. */
  system: DesignSystem;
  copy: SpecimenCopy;
  /** Examples from the repo's examples/ folder. */
  examples?: { name: string; code: string }[];
  /** Pages from the repo's docs/ folder. */
  docs?: SiteDoc[];
  repoUrl?: string;
}

export interface SiteResult {
  /** Files to write, relative to public/. */
  files: Record<string, string>;
  pages: string[];
  warnings: string[];
}

function asset(name: string): string {
  for (const rel of [`./${name}`, `./site/${name}`]) {
    const url = new URL(rel, import.meta.url);
    if (existsSync(url)) return readFileSync(url, "utf8");
  }
  throw new Error(`${name} is missing from @auto-design/site`);
}

const titleCase = (s: string) => {
  const w = s.replace(/[-_]+/g, " ").trim();
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/** The generated examples, with the repo's own layered on top by file name. */
export function mergeExamples(generated: ComponentExample[], custom: { name: string; code: string }[], componentNames: string[], titles: Record<string, string>): { examples: ComponentExample[]; warnings: string[] } {
  const warnings: string[] = [];
  const byName = new Map(generated.map((e) => [e.name, e]));
  const names = [...componentNames].sort((a, b) => b.length - a.length);
  for (const c of custom) {
    const existing = byName.get(c.name);
    if (existing) {
      byName.set(c.name, { ...existing, code: c.code });
      continue;
    }
    const component = names.find((n) => c.name === n || c.name.startsWith(`${n}-`));
    if (!component) {
      warnings.push(`examples/${c.name}.tsx doesn't match a component. Name it after one, like ${names[names.length - 1] ?? "button"}.tsx or ${names[names.length - 1] ?? "button"}-loading.tsx.`);
      continue;
    }
    const title = c.name === component ? titles[component] ?? titleCase(component) : titleCase(c.name.slice(component.length + 1));
    byName.set(c.name, { name: c.name, component, title, code: c.code });
  }
  // Main previews first, so each component's first example is the one named after it.
  const all = [...byName.values()];
  const main = all.filter((e) => e.name === e.component);
  return { examples: [...main, ...all.filter((e) => e.name !== e.component)], warnings };
}

export async function buildSite(input: SiteInput): Promise<SiteResult> {
  const { system: s, copy } = input;
  const components = componentSources(s);
  const uiComponents = components.filter((c) => c.type !== "registry:lib");
  const titles = Object.fromEntries(components.map((c) => [c.name, c.title]));
  const merged = mergeExamples(componentExamples(s, copy), input.examples ?? [], uiComponents.map((c) => c.name), titles);
  const warnings = [...merged.warnings];

  const [rendered, highlight] = await Promise.all([renderExamples(input.root, components, merged.examples), highlighter(s)]);
  for (const [name, err] of Object.entries(rendered.errors)) warnings.push(`The ${name} example didn't render: ${err}`);

  const ctx: PageContext = { s, copy, designMd: emitDesignMd(s), components, examples: merged.examples, rendered, highlight };

  const motion = motionPages(s, copy);
  const home = homePage(ctx);
  // The home page ends on the launch film, before the install band.
  home.body = home.body.replace('<section class="border-t bg-muted">', `${homeMotion(s, copy)}\n<section class="border-t bg-muted">`);
  home.motion = true;
  const generated: PageInput[] = [
    home,
    introductionPage(ctx),
    installationPage(ctx),
    agentsPage(ctx),
    guardrailsPage(ctx),
    colorsPage(ctx),
    typographyPage(ctx),
    shapePage(ctx),
    motionPage(ctx),
    voicePage(ctx),
    componentsIndexPage(ctx),
    ...uiComponents.map((c) => componentPage(ctx, c)),
    ...motion.pages,
  ];
  // A page in docs/ with a generated page's name replaces it.
  const custom = [...(input.docs ?? [])].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)).map((d) => customPage(ctx, d));
  const customPaths = new Set(custom.map((p) => p.path));
  const pages = [...generated.map((p) => custom.find((c) => c.path === p.path) ?? p), ...custom.filter((c) => !generated.some((g) => g.path === c.path))];

  const titleOf = (path: string) => pages.find((p) => p.path === path)?.title ?? "";
  const link = (path: string) => ({ title: titleOf(path), path });
  const nav: NavGroup[] = [
    { title: "Getting started", links: ["docs/", "docs/installation/", "docs/agents/", "docs/guardrails/"].map(link) },
    { title: "Foundations", links: ["docs/colors/", "docs/typography/", "docs/shape/", "docs/motion/", "docs/voice/"].map(link) },
  ];
  const builtIn = new Set(nav.flatMap((g) => g.links.map((l) => l.path)));
  const guides = custom.filter((p) => !builtIn.has(p.path) && customPaths.has(p.path));
  if (guides.length) nav.push({ title: "Guides", links: guides.map((p) => ({ title: p.title, path: p.path })) });
  nav.push({
    title: "Motion",
    links: [{ title: "All animations", path: "motion/" }, ...motion.pages.slice(1).map((p) => ({ title: p.title, path: p.path }))],
  });
  nav.push({
    title: "Components",
    links: [...uiComponents].sort((a, b) => a.title.localeCompare(b.title)).map((c) => ({ title: c.title, path: `docs/components/${c.name}/`, ...(c.custom ? { badge: "Custom" } : {}) })),
  });

  const modes = s.config.color.modes;
  const meta: SiteMeta = {
    name: s.config.displayName,
    title: /design system$/i.test(s.config.displayName) ? s.config.displayName : `${s.config.displayName} design system`,
    description: s.config.description,
    fontsHref: googleFontsHref(specimenData(s)),
    modeClass: modes === "both" ? (isDarkFirst(s) ? "light" : "dark") : null,
    defaultMode: modes === "dark" ? "dark" : modes === "light" ? "light" : s.config.color.defaultMode,
    storageKey: `${s.config.name}-design-mode`,
    repoUrl: input.repoUrl,
    nav,
    top: [
      { title: "Docs", path: "docs/" },
      { title: "Components", path: "docs/components/" },
      { title: "Motion", path: "motion/" },
    ],
    search: nav.flatMap((g) => g.links.map((l) => ({ title: l.title, group: g.title, path: l.path }))),
    generator: "auto-design 0.1.0",
  };

  const files: Record<string, string> = {};
  for (const page of pages) {
    const html = renderPage(meta, page).split("{root}").join(rootFor(page.path));
    files[`${page.path}index.html`] = html;
  }
  const client = asset("site-client.js");
  files["_site/site.js"] = client;
  if (rendered.client) files["_site/previews.js"] = rendered.client;
  Object.assign(files, motion.files);
  files["_site/site.css"] = await siteCss(s, [
    ...Object.values(files),
    ...components.map((c) => c.content),
    ...merged.examples.map((e) => e.code),
  ]);
  return { files, pages: pages.map((p) => p.path), warnings };
}
