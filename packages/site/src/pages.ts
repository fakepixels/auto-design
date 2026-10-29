import {
  PRODUCT_MAX_STEP,
  ROLE_NAMES,
  STEPS,
  TYPE_STEPS,
  bezier,
  toCss,
  toHex,
  type ComponentExample,
  type ComponentSource,
  type DesignSystem,
  type Oklch,
  type Scale,
  type SpecimenCopy,
} from "@auto-design/core";
import type { Highlight } from "./highlight.js";
import { renderMarkdown } from "./markdown.js";
import type { PageInput } from "./shell.js";
import { codePanel, command, esc, h2, h3, inlineCode, p, slugify, tabs, type TocItem } from "./ui.js";

/** Everything the generated pages draw from. */
export interface PageContext {
  s: DesignSystem;
  copy: SpecimenCopy;
  designMd: string;
  components: ComponentSource[];
  examples: ComponentExample[];
  rendered: { html: Record<string, string>; staticOnly: Set<string>; errors: Record<string, string> };
  highlight: Highlight;
}

const ORIGIN = "{origin}";
/** The site's own address, filled in by the site script: commands then work wherever it's hosted. */
const origin = `<span data-origin>${ORIGIN}</span>`;

const textOn = (c: Oklch) => (c.l > 0.62 ? "oklch(0.2 0 0)" : "oklch(0.98 0 0)");

/** A section of DESIGN.md, from its ## heading to the next one, without the heading. */
export function mdSection(md: string, heading: string): string {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

function prose(ctx: PageContext, md: string, toc?: TocItem[]): string {
  const r = renderMarkdown(md, ctx.highlight);
  toc?.push(...r.toc);
  return r.html;
}

function systemTitle(s: DesignSystem): string {
  return /design system$/i.test(s.config.displayName) ? s.config.displayName : `${s.config.displayName} design system`;
}

function btn(kind: "primary" | "outline", s: DesignSystem, href: string, label: string): string {
  const h = `h-${s.controls.lg}`;
  return kind === "primary"
    ? `<a href="${href}" class="inline-flex ${h} items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">${esc(label)}</a>`
    : `<a href="${href}" class="inline-flex ${h} items-center justify-center rounded-md border bg-background px-5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">${esc(label)}</a>`;
}

/* ---------- Live examples ---------- */

export function preview(ctx: PageContext, name: string, opts: { minHeight?: string; frame?: boolean } = {}): string {
  const err = ctx.rendered.errors[name];
  if (err) {
    return `<div class="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm"><p class="font-medium">This example didn't render</p><p class="mt-1 font-mono text-xs text-muted-foreground">${esc(err)}</p></div>`;
  }
  const html = ctx.rendered.html[name] ?? "";
  const island = `<div data-preview="${esc(name)}"${ctx.rendered.staticOnly.has(name) ? " data-static" : ""} class="flex w-full min-w-0 justify-center">${html}</div>`;
  if (opts.frame === false) return island;
  return `<div class="flex ${opts.minHeight ?? "min-h-72"} w-full items-center justify-center overflow-x-auto rounded-lg border bg-background p-6 md:p-10">${island}</div>`;
}

function exampleTabs(ctx: PageContext, e: ComponentExample): string {
  return tabs(`example-${e.name}`, [
    { label: "Preview", panel: preview(ctx, e.name) },
    { label: "Code", panel: codePanel(ctx.highlight(e.code, "tsx"), e.code) },
  ]);
}

/* ---------- Home ---------- */

const SHOWCASE = ["card", "approval", "table", "message", "input-with-button", "switch", "tabs", "badge", "dialog", "citation", "streaming-text", "file-card", "toaster", "avatar"];

export function homePage(ctx: PageContext): PageInput {
  const { s, copy } = ctx;
  const display = s.type.fonts.display ? " font-display" : "";
  const brand = s.palettes.brand;
  const names = new Set(ctx.examples.map((e) => e.name));
  const tiles = SHOWCASE.filter((n) => names.has(n)).slice(0, 10);
  const comp = (n: string) => ctx.examples.find((e) => e.name === n)!.component;
  // Wide examples get a row of their own; the rest flow into columns.
  const featured = ["table", "card"].filter((n) => tiles.includes(n));
  const rest = tiles.filter((n) => !featured.includes(n));
  const tile = (n: string, cls: string) => `<figure class="flex min-w-0 flex-col rounded-xl border bg-card p-6 ${cls}">
      <div class="flex min-w-0 flex-1 items-center overflow-x-auto">${preview(ctx, n, { frame: false })}</div>
      <figcaption class="mt-6 text-xs"><a href="docs/components/${comp(n)}/" class="font-medium text-muted-foreground transition-colors hover:text-foreground">${esc(ctx.components.find((c) => c.name === comp(n))?.title ?? comp(n))}</a></figcaption>
    </figure>`;
  const r = s.config.shape.radius;

  const glance = [
    {
      title: "Color",
      href: "docs/colors/",
      body: `<div class="flex h-10 overflow-hidden rounded-md">${STEPS.map((st) => `<span class="flex-1" style="background:${toCss(brand[st])}"></span>`).join("")}</div>
      <p class="mt-3 text-sm text-muted-foreground">One brand color, ${s.config.color.neutral} grays, ${s.config.color.modes === "both" ? "light and dark mode" : `${s.config.color.modes} mode`}.</p>`,
    },
    {
      title: "Type",
      href: "docs/typography/",
      body: `<p class="text-4xl font-semibold leading-none${display}">Aa</p>
      <p class="mt-3 text-sm text-muted-foreground">${esc((s.type.fonts.display ?? s.type.fonts.sans).family.replace(/ Variable$/, ""))}${s.type.fonts.display ? ` and ${esc(s.type.fonts.sans.family.replace(/ Variable$/, ""))}` : ""}, ${s.type.scale.base.px}px base.</p>`,
    },
    {
      title: "Shape",
      href: "docs/shape/",
      body: `<div class="flex h-10 items-end gap-2"><span class="size-10 rounded-sm border bg-muted"></span><span class="size-10 rounded-lg border bg-muted"></span><span class="size-10 rounded-full border bg-muted"></span></div>
      <p class="mt-3 text-sm text-muted-foreground">${r}px corners, ${s.config.density} density, ${s.config.texture} surfaces.</p>`,
    },
    {
      title: "Motion",
      href: "motion/",
      body: `<div class="flex h-10 items-center"><span data-glance-motion class="block h-2 w-full overflow-hidden rounded-full bg-muted"><span class="block h-full w-1/3 rounded-full bg-primary"></span></span></div>
      <p class="mt-3 text-sm text-muted-foreground">${s.motion.name.charAt(0).toUpperCase() + s.motion.name.slice(1)}: ${s.motion.durations.fast} to ${s.motion.durations.slow}ms, nothing over ${s.motion.maxDuration}ms.</p>`,
    },
  ];

  const body = `
<section class="mx-auto max-w-7xl px-4 pb-16 pt-16 md:px-6 md:pt-24">
  <h1 class="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl${display}">${esc(systemTitle(s))}</h1>
  <p class="mt-5 max-w-2xl text-lg text-muted-foreground">${esc(s.config.description || `Tokens, components and rules for ${copy.product}.`)}</p>
  <div class="mt-8 flex flex-wrap gap-2">${btn("primary", s, "docs/installation/", "Get started")}${btn("outline", s, "docs/components/", "Browse components")}</div>
</section>

<section class="mx-auto max-w-7xl px-4 md:px-6" aria-label="At a glance">
  <div class="grid overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4">
    ${glance
      .map(
        (g, i) => `<a href="${g.href}" class="group block p-6 transition-colors hover:bg-muted ${i ? "border-t sm:border-t-0" : ""} ${i % 2 ? "sm:border-l" : ""} ${i >= 2 ? "sm:border-t lg:border-t-0" : ""} ${i ? "lg:border-l" : ""}">
      <p class="mb-4 text-sm font-medium">${g.title}</p>
      ${g.body}
    </a>`,
      )
      .join("\n")}
  </div>
</section>

<section class="mx-auto max-w-7xl px-4 py-16 md:px-6" aria-label="Components in use">
  ${featured.length ? `<div class="mb-6 grid gap-6 lg:grid-cols-3">${featured.map((n, i) => tile(n, i === 0 && featured.length > 1 ? "lg:col-span-2" : "")).join("\n")}</div>` : ""}
  <div class="columns-1 gap-6 md:columns-2 xl:columns-3">
    ${rest.map((n) => tile(n, "mb-6 break-inside-avoid")).join("\n")}
  </div>
</section>

<section class="border-t bg-muted">
  <div class="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-2 md:px-6">
    <div class="min-w-0">
      <h2 class="text-xl font-semibold tracking-tight">Use it in an app</h2>
      <p class="mt-2 text-muted-foreground">Any Tailwind v4 app: Next.js, Vite, React Router or Astro. This installs the theme, the components and the rules.</p>
      <div class="mt-4">${command(`npx auto-design add ${origin}/r/ --components all`, `npx auto-design add ${ORIGIN}/r/ --components all`)}</div>
    </div>
    <div class="min-w-0">
      <h2 class="text-xl font-semibold tracking-tight">Hand it to your agents</h2>
      <p class="mt-2 text-muted-foreground">Coding agents read <a href="DESIGN.md" class="font-medium text-foreground underline underline-offset-4">DESIGN.md</a>, ask the MCP server for tokens and components, and check their work before they finish.</p>
      <div class="mt-4">${btn("outline", s, "docs/agents/", "Set up agents")}</div>
    </div>
  </div>
</section>`;
  return { path: "", title: systemTitle(s), description: s.config.description, body, previews: tiles.length > 0 };
}

/* ---------- Getting started ---------- */

export function introductionPage(ctx: PageContext): PageInput {
  const { s, copy } = ctx;
  const toc: TocItem[] = [];
  const c = s.config;
  const facts: [string, string][] = [
    ["Brand color", `<span class="inline-flex items-center gap-2"><span class="size-3 rounded-sm" style="background:${toCss(s.brand.seed)}"></span>${inlineCode(c.color.brand)}</span>`],
    ["Typefaces", esc([s.type.fonts.display, s.type.fonts.sans, s.type.fonts.mono].filter(Boolean).map((f) => f!.family.replace(/ Variable$/, "")).join(", "))],
    ["Texture", esc(c.texture)],
    ["Density", esc(c.density)],
    ["Motion", esc(s.motion.name)],
    ["Color modes", esc(c.color.modes === "both" ? `Light and dark, ${c.color.defaultMode} first` : c.color.modes)],
    ["Surfaces", esc(c.surfaces.join(", "))],
  ];
  const cards = [
    ["Installation", "docs/installation/", "Add the system to an app and check it."],
    ["Components", "docs/components/", `${ctx.components.filter((x) => x.type !== "registry:lib").length} components, styled to the rules.`],
    ["For agents", "docs/agents/", "DESIGN.md, the MCP server and the checks."],
  ];
  const body = `
${p(`${esc(c.displayName)} is the design system for ${esc(copy.product)}. It is compiled from one file, ${inlineCode("design.config.ts")}, into a locked Tailwind theme, components, design tokens and the rules your team and its coding agents follow. Every color pair passes WCAG AA in light and dark mode, and anything off the system fails the build.`)}
${p("Every page on this site is drawn with the system's own tokens and components, so what you see here is what on-system looks like.")}
${h2("principles", "Principles")}
${prose(ctx, mdSection(ctx.designMd, "Principles"))}
${h2("at-a-glance", "At a glance")}
<dl class="mt-6 divide-y rounded-lg border">
  ${facts.map(([k, v]) => `<div class="grid gap-1 px-4 py-3 text-sm sm:grid-cols-3"><dt class="text-muted-foreground">${k}</dt><dd class="sm:col-span-2">${v}</dd></div>`).join("")}
</dl>
${h2("next", "Next")}
<div class="mt-6 grid gap-4 sm:grid-cols-3">
  ${cards.map(([t, href, d]) => `<a href="{root}${href}" class="block rounded-lg border p-4 transition-colors hover:bg-muted"><p class="text-sm font-medium">${t}</p><p class="mt-1 text-sm text-muted-foreground">${esc(d!)}</p></a>`).join("")}
</div>`;
  toc.push({ id: "principles", text: "Principles", level: 2 }, { id: "at-a-glance", text: "At a glance", level: 2 }, { id: "next", text: "Next", level: 2 });
  return { path: "docs/", title: "Introduction", description: s.config.description, body, docs: true, toc };
}

export function installationPage(ctx: PageContext): PageInput {
  const { s } = ctx;
  const fonts = [s.type.fonts.sans, s.type.fonts.mono, s.type.fonts.display].filter((f) => f?.package).map((f) => `import "${f!.package}";`).join("\n");
  const toc: TocItem[] = [
    { id: "add", text: "Add it to your app", level: 2 },
    { id: "fonts", text: "Import the fonts", level: 2 },
    { id: "check", text: "Check your work", level: 2 },
    { id: "shadcn", text: "With the shadcn CLI", level: 2 },
  ];
  const body = `
${p("The system works in any React app on Tailwind CSS v4: Next.js, Vite, React Router or Astro.")}
${h2("add", "Add it to your app")}
${p("Run this in the app's folder. It installs the theme, every component, DESIGN.md and the guardrails, points AGENTS.md and CLAUDE.md at the rules, and registers the MCP server for coding agents.")}
<div class="mt-4">${command(`npx auto-design add ${origin}/r/ --components all`, `npx auto-design add ${ORIGIN}/r/ --components all`)}</div>
${p(`To add only some components, list them: ${inlineCode("--components button,card,dialog")}.`)}
${h2("fonts", "Import the fonts")}
${p("Once, in the root layout. The fonts are open source and install from npm with the system.")}
<div class="mt-4">${codePanel(ctx.highlight(fonts, "ts"), fonts)}</div>
${h2("check", "Check your work")}
${p("The check reads the guardrails and fails on anything off the system: raw colors, palette classes, sizes and spacing outside the scales.")}
<div class="mt-4">${command("npx auto-design check", "npx auto-design check")}</div>
${p(`See <a href="{root}docs/guardrails/" class="font-medium text-primary underline underline-offset-4">Guardrails</a> for every rule.`)}
${h2("shadcn", "With the shadcn CLI")}
${p("The system is also a shadcn registry. Install the base first, then components one at a time.")}
<div class="mt-4 grid gap-2">
  ${command(`npx shadcn@latest add ${origin}/r/base.json`, `npx shadcn@latest add ${ORIGIN}/r/base.json`)}
  ${command(`npx shadcn@latest add ${origin}/r/button.json`, `npx shadcn@latest add ${ORIGIN}/r/button.json`)}
</div>`;
  return { path: "docs/installation/", title: "Installation", description: "Add the system to an app, import its fonts and check the result.", body, docs: true, toc };
}

export function agentsPage(ctx: PageContext): PageInput {
  const mcp = JSON.stringify({ mcpServers: { "auto-design": { command: "npx", args: ["auto-design", "mcp"] } } }, null, 2);
  const tools: [string, string][] = [
    ["get_rules", "DESIGN.md, or one section of it."],
    ["get_tokens", "Colors, type, spacing, radius and motion as values."],
    ["list_components", "What the system provides, before writing anything new."],
    ["get_component", "One component's source, props and variants."],
    ["check_code", "Lint code or files against the guardrails."],
    ["check_message", "Check a text message or chat reply against the voice and texting rules."],
    ["render_card", "Draw an image card or link preview in the system's style."],
  ];
  const cli = `npx auto-design check --json              # every violation, machine-readable
npx auto-design message "Your report is ready"   # check a text against the voice rules
npx auto-design card --title "92% on track"      # an image card for texts and link previews
npx auto-design review http://localhost:3000/    # screenshot the app and check what it drew`;
  const toc: TocItem[] = [
    { id: "design-md", text: "DESIGN.md", level: 2 },
    { id: "mcp", text: "MCP server", level: 2 },
    { id: "commands", text: "Commands", level: 2 },
  ];
  const body = `
${p("Coding agents write most new UI. The system gives them the same rules people follow, and a way to check their work before they finish.")}
${h2("design-md", "DESIGN.md")}
${p(`Every rule, role, scale and component, written for agents. ${inlineCode("auto-design add")} copies it into the app and points AGENTS.md and CLAUDE.md at it. It is also hosted here: <a href="{root}DESIGN.md" class="font-medium text-primary underline underline-offset-4">DESIGN.md</a>, with a short index at <a href="{root}llms.txt" class="font-medium text-primary underline underline-offset-4">llms.txt</a>.`)}
${h2("mcp", "MCP server")}
${p(`${inlineCode("auto-design add")} registers it in the app's ${inlineCode(".mcp.json")}. To add it by hand:`)}
<div class="mt-4">${codePanel(ctx.highlight(mcp, "json"), mcp)}</div>
<div class="mt-6 overflow-hidden rounded-lg border"><table class="w-full text-sm"><thead><tr><th class="border-b bg-muted px-4 py-2 text-left font-medium">Tool</th><th class="border-b bg-muted px-4 py-2 text-left font-medium">What it does</th></tr></thead><tbody>
${tools.map(([t, d]) => `<tr><td class="border-b px-4 py-2 font-mono text-xs">${t}</td><td class="border-b px-4 py-2">${esc(d)}</td></tr>`).join("")}
</tbody></table></div>
${h2("commands", "Commands")}
${p("The same checks run from the command line, for agents without MCP and for CI.")}
<div class="mt-4">${codePanel(ctx.highlight(cli, "bash"), cli)}</div>`;
  return { path: "docs/agents/", title: "For agents", description: "How coding agents learn the system and check their own work.", body, docs: true, toc };
}

export function guardrailsPage(ctx: PageContext): PageInput {
  const toc: TocItem[] = [];
  const ci = `- run: npx auto-design check`;
  const body = `
${p("The theme is locked: Tailwind's default palette, sizes, radii and shadows are removed, so off-system classes don't exist. The check catches the rest, in code and CSS, and fails the build.")}
${prose(ctx, mdSection(ctx.designMd, "Checking your work"), toc)}
${h2("ci", "In CI")}
${p("Add one step to the app's workflow.")}
<div class="mt-4">${codePanel(ctx.highlight(ci, "yaml"), ci)}</div>`;
  toc.push({ id: "ci", text: "In CI", level: 2 });
  return { path: "docs/guardrails/", title: "Guardrails", description: "What the check enforces, and how to make an exception.", body, docs: true, toc };
}

/* ---------- Foundations ---------- */

function scaleRow(name: string, scale: Scale, mark?: number): string {
  return `<div class="mt-4">
  <p class="mb-2 text-sm font-medium">${esc(name)}</p>
  <div class="grid grid-cols-6 gap-2 sm:grid-cols-11">
    ${STEPS.map((st) => {
      const c = scale[st];
      return `<div><div class="flex h-14 items-end rounded-md p-1.5 text-xs tabular-nums" style="background:${toCss(c)};color:${textOn(c)};box-shadow:inset 0 0 0 1px oklch(0.5 0 0 / 0.08)">${st === mark ? "Base" : ""}</div><p class="mt-1 text-xs tabular-nums">${st}</p><p class="font-mono text-xs text-muted-foreground">${toHex(c).slice(1)}</p></div>`;
    }).join("")}
  </div>
</div>`;
}

export function colorsPage(ctx: PageContext): PageInput {
  const { s } = ctx;
  const modes = s.config.color.modes === "both" ? (["light", "dark"] as const) : ([s.config.color.modes] as const);
  const roles = ROLE_NAMES.filter((r) => !r.startsWith("sidebar") && !r.startsWith("chart"));
  const roleClass = (r: string) => (r.endsWith("foreground") ? `text-${r}` : r === "border" || r === "input" ? `border-${r}` : r === "ring" ? "ring-ring" : `bg-${r}`);
  const swatch = (c: Oklch) => `<span class="inline-flex items-center gap-2"><span class="size-5 rounded-sm" style="background:${toCss(c)};box-shadow:inset 0 0 0 1px oklch(0.5 0 0 / 0.15)"></span><span class="font-mono text-xs text-muted-foreground">${toHex(c)}</span></span>`;
  const pairs = new Map<string, { fg: string; bg: string; min: number; ratios: Record<string, number> }>();
  for (const c of s.report.checks) {
    const key = `${c.fg}|${c.bg}`;
    const entry = pairs.get(key) ?? { fg: c.fg, bg: c.bg, min: c.min, ratios: {} };
    entry.ratios[c.mode] = c.ratio;
    pairs.set(key, entry);
  }
  const passed = s.report.checks.filter((c) => c.pass).length;
  const toc: TocItem[] = [
    { id: "scales", text: "Scales", level: 2 },
    { id: "roles", text: "Roles", level: 2 },
    { id: "contrast", text: "Contrast", level: 2 },
  ];
  const body = `
${p(`Code uses roles, never raw values: ${inlineCode("bg-primary")}, ${inlineCode("text-muted-foreground")}, ${inlineCode("border-border")}. Each role has a value for ${modes.length === 2 ? "light and dark mode" : `${modes[0]} mode`}, built from the scales below.`)}
${h2("scales", "Scales")}
${p(`The brand scale grows from one color, ${inlineCode(s.config.color.brand)}. The grays are ${esc(s.config.color.neutral)}.`)}
${scaleRow("Brand", s.palettes.brand, s.brand.step)}
${scaleRow("Gray", s.palettes.neutral)}
${scaleRow("Success", s.palettes.success)}
${scaleRow("Warning", s.palettes.warning)}
${scaleRow("Danger", s.palettes.danger)}
${h2("roles", "Roles")}
<div class="mt-6 overflow-x-auto rounded-lg border"><table class="w-full text-sm">
  <thead><tr><th class="border-b bg-muted px-4 py-2 text-left font-medium">Role</th>${modes.map((m) => `<th class="border-b bg-muted px-4 py-2 text-left font-medium">${m === "light" ? "Light" : "Dark"}</th>`).join("")}<th class="border-b bg-muted px-4 py-2 text-left font-medium">Class</th></tr></thead>
  <tbody>${roles
    .map(
      (r) => `<tr><td class="border-b px-4 py-2 font-medium">${r}</td>${modes.map((m) => `<td class="border-b px-4 py-2">${swatch(s.roles[m][r])}</td>`).join("")}<td class="border-b px-4 py-2 font-mono text-xs">${roleClass(r)}</td></tr>`,
    )
    .join("")}</tbody>
</table></div>
${h2("contrast", "Contrast")}
${p(`${passed} of ${s.report.checks.length} pairs pass WCAG AA. The build checks every text and fill pair and fails if one misses${s.report.fixes.length ? `; it adjusted ${s.report.fixes.length} value${s.report.fixes.length === 1 ? "" : "s"} to get there` : ""}.`)}
<div class="mt-6 overflow-x-auto rounded-lg border"><table class="w-full text-sm">
  <thead><tr><th class="border-b bg-muted px-4 py-2 text-left font-medium">Text</th><th class="border-b bg-muted px-4 py-2 text-left font-medium">On</th>${modes.map((m) => `<th class="border-b bg-muted px-4 py-2 text-right font-medium">${m === "light" ? "Light" : "Dark"}</th>`).join("")}<th class="border-b bg-muted px-4 py-2 text-right font-medium">Needs</th></tr></thead>
  <tbody>${[...pairs.values()]
    .map(
      (x) => `<tr><td class="border-b px-4 py-2">${x.fg}</td><td class="border-b px-4 py-2 text-muted-foreground">${x.bg}</td>${modes.map((m) => `<td class="border-b px-4 py-2 text-right tabular-nums">${x.ratios[m] !== undefined ? `${x.ratios[m]!.toFixed(1)}:1` : ""}</td>`).join("")}<td class="border-b px-4 py-2 text-right tabular-nums text-muted-foreground">${x.min}:1</td></tr>`,
    )
    .join("")}</tbody>
</table></div>`;
  return { path: "docs/colors/", title: "Colors", description: "Scales, semantic roles and the contrast every pair passes.", body, docs: true, toc };
}

export function typographyPage(ctx: PageContext): PageInput {
  const { s, copy } = ctx;
  const fams = [
    s.type.fonts.display && { role: "Display", cls: "font-display", f: s.type.fonts.display, use: "Headlines at text-2xl and up" },
    { role: "Sans", cls: "font-sans", f: s.type.fonts.sans, use: "Interface and body text" },
    { role: "Mono", cls: "font-mono", f: s.type.fonts.mono, use: "Code, numbers in data and commands" },
  ].filter(Boolean) as { role: string; cls: string; f: DesignSystem["type"]["fonts"]["sans"]; use: string }[];
  const maxProduct = TYPE_STEPS.indexOf(PRODUCT_MAX_STEP);
  const toc: TocItem[] = [
    { id: "typefaces", text: "Typefaces", level: 2 },
    { id: "scale", text: "Scale", level: 2 },
    { id: "weights", text: "Weights", level: 2 },
  ];
  const body = `
${p(`Sizes come from one scale, a ratio of ${s.config.type.ratio} on a ${s.type.scale.base.px}px base. Only these sizes, families and weights exist as classes.`)}
${h2("typefaces", "Typefaces")}
<div class="mt-6 grid gap-4 sm:grid-cols-${fams.length > 2 ? 3 : 2}">
  ${fams
    .map(
      (x) => `<div class="rounded-lg border p-5">
    <p class="text-5xl leading-none ${x.cls}">Aa</p>
    <p class="mt-4 font-medium">${esc(x.f.family.replace(/ Variable$/, ""))}</p>
    <p class="text-sm text-muted-foreground">${x.role}. ${esc(x.use)}.</p>
    <p class="mt-3 font-mono text-xs text-muted-foreground">${esc(x.cls)} · ${esc(x.f.package ?? "")}</p>
  </div>`,
    )
    .join("")}
</div>
${h2("scale", "Scale")}
${p(`${inlineCode(`text-${TYPE_STEPS[maxProduct + 1]}`)} and up are for marketing pages; product UI stops at ${inlineCode(`text-${PRODUCT_MAX_STEP}`)}.`)}
<div class="mt-6 divide-y rounded-lg border">
  ${[...TYPE_STEPS]
    .reverse()
    .map((st) => {
      const v = s.type.scale[st];
      const big = TYPE_STEPS.indexOf(st) >= TYPE_STEPS.indexOf("2xl");
      const sample = big ? copy.headline : copy.pageSummary;
      return `<div class="grid gap-2 px-4 py-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-baseline">
      <div class="text-xs text-muted-foreground"><p class="font-mono text-foreground">text-${st}</p><p class="tabular-nums">${v.px}px / ${v.lineHeight}</p></div>
      <p class="truncate text-${st}${big && s.type.fonts.display ? " font-display" : ""}${big ? " font-semibold" : ""}">${esc(sample)}</p>
    </div>`;
    })
    .join("")}
</div>
${h2("weights", "Weights")}
<div class="mt-6 flex flex-wrap gap-6">
  ${s.type.weights.map((w) => `<div><p class="text-2xl" style="font-weight:${w}">Aa</p><p class="mt-1 font-mono text-xs text-muted-foreground">${w}</p></div>`).join("")}
</div>`;
  return { path: "docs/typography/", title: "Typography", description: "Typefaces, the type scale and the weights that exist.", body, docs: true, toc };
}

export function shapePage(ctx: PageContext): PageInput {
  const { s } = ctx;
  const r = s.config.shape.radius;
  const radii: [string, string][] = [
    ["sm", `${Math.max(0, r - 4)}px`],
    ["md", `${Math.max(0, r - 2)}px`],
    ["lg", `${r}px`],
    ["xl", `${r + 4}px`],
    ["full", "pill"],
  ];
  const toc: TocItem[] = [
    { id: "radius", text: "Radius", level: 2 },
    { id: "elevation", text: "Elevation", level: 2 },
    { id: "sizes", text: "Control sizes", level: 2 },
    { id: "spacing", text: "Spacing", level: 2 },
    { id: "texture", text: "Texture", level: 2 },
  ];
  const body = `
${p(`${esc(s.config.density.charAt(0).toUpperCase() + s.config.density.slice(1))} density, ${r}px corners and ${esc(s.config.texture)} surfaces.`)}
${h2("radius", "Radius")}
<div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
  ${radii.map(([k, v]) => `<div><div class="h-20 rounded-${k} border bg-muted"></div><p class="mt-2 font-mono text-xs">rounded-${k}</p><p class="text-xs text-muted-foreground">${v}</p></div>`).join("")}
</div>
${h2("elevation", "Elevation")}
<div class="mt-6 grid grid-cols-2 gap-6 rounded-lg bg-muted p-6 sm:grid-cols-4">
  ${(["xs", "sm", "md", "lg"] as const).map((k) => `<div><div class="h-20 rounded-lg bg-card shadow-${k}"></div><p class="mt-3 font-mono text-xs">shadow-${k}</p></div>`).join("")}
</div>
${p(`${inlineCode("shadow-lg")} is for floating layers: dialogs, popovers and toasts.`)}
${h2("sizes", "Control sizes")}
${p("Buttons and inputs share heights, so they line up in a row.")}
<div class="mt-6 flex flex-wrap items-end gap-4">
  ${(["sm", "md", "lg"] as const).map((k) => `<div><div class="flex h-${s.controls[k]} items-center rounded-md border bg-background px-3 text-sm">${k === "sm" ? "Small" : k === "md" ? "Default" : "Large"}</div><p class="mt-2 font-mono text-xs">h-${s.controls[k]} · ${s.controls[k] * 4}px</p></div>`).join("")}
</div>
${h2("spacing", "Spacing")}
${p("Padding, margin and gaps use these steps, in units of 4px.")}
<div class="mt-6 grid gap-1.5">
  ${s.spacing
    .filter((n) => n > 0 && n <= 32)
    .map((n) => `<div class="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-4"><span class="font-mono text-xs text-muted-foreground">${n}</span><span class="block h-3 rounded-sm bg-primary" style="width:${n * 4}px"></span></div>`)
    .join("")}
</div>
${h2("texture", "Texture")}
${prose(ctx, mdSection(ctx.designMd, "Texture"))}`;
  return { path: "docs/shape/", title: "Shape and space", description: "Radius, elevation, control sizes, spacing and texture.", body, docs: true, toc };
}

function curve(b: readonly number[]): string {
  const [x1, y1, x2, y2] = b as [number, number, number, number];
  const P = (x: number, y: number) => `${(x * 100).toFixed(1)} ${(100 - y * 100).toFixed(1)}`;
  return `<svg viewBox="-4 -4 108 108" class="h-24 w-24" aria-hidden="true"><path d="M${P(0, 0)} L${P(1, 1)}" stroke="currentColor" stroke-opacity="0.15" fill="none"/><path d="M${P(0, 0)} C${P(x1, y1)} ${P(x2, y2)} ${P(1, 1)}" stroke="var(--primary)" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;
}

export function motionPage(ctx: PageContext): PageInput {
  const { s } = ctx;
  const d = s.motion.durations;
  const toc: TocItem[] = [
    { id: "durations", text: "Durations", level: 2 },
    { id: "easing", text: "Easing", level: 2 },
    { id: "entering", text: "Entering", level: 2 },
    { id: "rules", text: "Rules", level: 2 },
    { id: "brand", text: "Brand animations", level: 2 },
  ];
  const body = `
${p(`The ${esc(s.motion.name)} profile. Motion answers what people do: a press, a confirmation, a sheet sliding in. Press a row to play it.`)}
${h2("durations", "Durations")}
<div class="mt-6 grid gap-3">
  ${(["fast", "base", "slow"] as const)
    .map(
      (k) => `<button type="button" data-motion-demo data-duration="${d[k]}" class="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted">
    <span><span class="block text-sm font-medium">${k.charAt(0).toUpperCase() + k.slice(1)}</span><span class="block font-mono text-xs text-muted-foreground">duration-${d[k]}</span></span>
    <span class="relative block h-8 rounded-md bg-muted"><span data-dot class="absolute left-1 top-1 block size-6 rounded-md bg-primary" style="transition-property:transform;transition-duration:${d[k]}ms;transition-timing-function:${bezier(s.motion.easing.out)}"></span></span>
  </button>`,
    )
    .join("")}
</div>
${p(`Nothing in product UI runs longer than ${s.motion.maxDuration}ms.`)}
${h2("easing", "Easing")}
<div class="mt-6 grid gap-4 sm:grid-cols-2">
  <div class="flex items-center gap-4 rounded-lg border p-4">${curve(s.motion.easing.out)}<div><p class="font-mono text-sm">ease-out</p><p class="text-sm text-muted-foreground">Things entering, or answering a press.</p></div></div>
  <div class="flex items-center gap-4 rounded-lg border p-4">${curve(s.motion.easing.inOut)}<div><p class="font-mono text-sm">ease-in-out</p><p class="text-sm text-muted-foreground">Things moving from one place to another.</p></div></div>
</div>
${h2("entering", "Entering")}
${p(`${inlineCode("animate-enter")}: a fade${s.motion.enterScale < 1 ? ` from scale ${s.motion.enterScale}` : ""}${s.motion.enterDistance ? ` with ${s.motion.enterDistance}px of travel` : ""}.`)}
<div class="mt-6 flex min-h-48 flex-col items-center justify-center gap-4 rounded-lg border bg-muted p-6">
  <div data-replay-target class="animate-enter w-64 rounded-lg border bg-card p-4 shadow-lg"><p class="text-sm font-medium">${esc(ctx.copy.done)}</p><p class="mt-1 text-sm text-muted-foreground">${esc(ctx.copy.pageSummary)}</p></div>
  <button type="button" data-replay class="inline-flex h-${s.controls.sm} items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent">Replay</button>
</div>
${h2("rules", "Rules")}
${prose(ctx, mdSection(ctx.designMd, "Motion").replace(/^Profile:.*$/m, ""))}
${h2("brand", "Brand animations")}
${p(`The same profile drives launch films, social posts and product walkthroughs, slower and larger than product UI. See them in <a href="{root}motion/" class="font-medium text-primary underline underline-offset-4">Motion</a>.`)}`;
  return { path: "docs/motion/", title: "Motion", description: "Durations, easing and how things enter.", body, docs: true, toc };
}

export function voicePage(ctx: PageContext): PageInput {
  const toc: TocItem[] = [{ id: "rules", text: "Rules", level: 2 }];
  const surfaces = mdSection(ctx.designMd, "Surfaces");
  const body = `
${p("How the product sounds in buttons, errors, empty states and messages.")}
${h2("rules", "Rules")}
${prose(ctx, mdSection(ctx.designMd, "Voice"))}
${surfaces ? `${h2("surfaces", "By surface")}\n${prose(ctx, surfaces.replace(/^### /gm, "## ").replace(/^.*targets:.*$/m, ""), toc)}` : ""}`;
  if (surfaces) toc.splice(1, 0, { id: "surfaces", text: "By surface", level: 2 });
  return { path: "docs/voice/", title: "Voice and surfaces", description: "Copy rules, and what changes on each surface the product reaches.", body, docs: true, toc };
}

/* ---------- Components ---------- */

export function componentsIndexPage(ctx: PageContext): PageInput {
  const list = ctx.components.filter((c) => c.type !== "registry:lib").sort((a, b) => a.title.localeCompare(b.title));
  const body = `
<div class="grid gap-3 sm:grid-cols-2">
  ${list
    .map(
      (c) => `<a href="{root}docs/components/${c.name}/" class="block rounded-lg border p-4 transition-colors hover:bg-muted">
    <p class="flex items-center gap-2 text-sm font-medium">${esc(c.title)}${c.custom ? '<span class="rounded-sm bg-muted px-1.5 text-xs font-normal text-muted-foreground">Custom</span>' : ""}</p>
    <p class="mt-1 text-sm text-muted-foreground">${esc(c.description || "No description yet.")}</p>
  </a>`,
    )
    .join("")}
</div>`;
  return { path: "docs/components/", title: "Components", description: "Every component in the system, styled to its rules. Install one, some or all.", body, docs: true };
}

/** The JSX an example returns, for the Usage section. */
function usageOf(code: string, name: string): string {
  const imports = [...code.matchAll(/^import[\s\S]*?from "([^"]+)";$/gm)].filter((m) => m[1] === `@/components/ui/${name}`).map((m) => m[0]);
  const m = code.match(/return \(\n([\s\S]*?)\n\s*\);/) ?? code.match(/return (<[\s\S]*?\/>);/);
  let jsx = m?.[1] ?? "";
  const indent = Math.min(...jsx.split("\n").filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length));
  if (Number.isFinite(indent)) jsx = jsx.split("\n").map((l) => l.slice(indent)).join("\n");
  return [imports.join("\n"), jsx].filter(Boolean).join("\n\n");
}

export function componentPage(ctx: PageContext, c: ComponentSource): PageInput {
  const examples = ctx.examples.filter((e) => e.component === c.name);
  const [main, ...rest] = examples;
  const toc: TocItem[] = [];
  const deps = c.dependencies;
  const install = tabs(`install-${c.name}`, [
    { label: "auto-design", panel: command(`npx auto-design add ${origin}/r/ --components ${c.name}`, `npx auto-design add ${ORIGIN}/r/ --components ${c.name}`) },
    { label: "shadcn", panel: command(`npx shadcn@latest add ${origin}/r/${c.name}.json`, `npx shadcn@latest add ${ORIGIN}/r/${c.name}.json`) },
    {
      label: "Manual",
      panel: `${deps.length ? `<p class="mb-3 text-sm text-muted-foreground">Install the dependencies, then copy the source into <code class="font-mono">components/ui/${esc(c.file)}</code>.</p>${command(`npm install ${esc(deps.join(" "))}`, `npm install ${deps.join(" ")}`)}<div class="mt-3"></div>` : `<p class="mb-3 text-sm text-muted-foreground">Copy the source into <code class="font-mono">components/ui/${esc(c.file)}</code>.</p>`}${codePanel(ctx.highlight(c.content, "tsx"), c.content)}`,
    },
  ]);
  const parts: string[] = [];
  if (main) parts.push(exampleTabs(ctx, main));
  else
    parts.push(
      `<div class="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No live example yet. Add <code class="font-mono">examples/${esc(c.name)}.tsx</code> to the design system repo with a default export, and it shows up here.</div>`,
    );
  parts.push(h2("installation", "Installation"), `<div class="mt-4">${install}</div>`);
  toc.push({ id: "installation", text: "Installation", level: 2 });
  if (main) {
    const usage = usageOf(main.code, c.name);
    if (usage) {
      parts.push(h2("usage", "Usage"), `<div class="mt-4">${codePanel(ctx.highlight(usage, "tsx"), usage)}</div>`);
      toc.push({ id: "usage", text: "Usage", level: 2 });
    }
  }
  if (rest.length) {
    parts.push(h2("examples", "Examples"));
    toc.push({ id: "examples", text: "Examples", level: 2 });
    for (const e of rest) {
      const id = slugify(e.title);
      parts.push(h3(id, e.title), `<div class="mt-4">${exampleTabs(ctx, e)}</div>`);
      toc.push({ id, text: e.title, level: 3 });
    }
  }
  const requires = c.requires ?? [];
  if (deps.length || requires.length) {
    parts.push(h2("dependencies", "Dependencies"));
    toc.push({ id: "dependencies", text: "Dependencies", level: 2 });
    parts.push(
      `<ul class="my-4 ml-6 list-disc text-sm [&>li]:mt-2">${deps.map((d) => `<li><a href="https://www.npmjs.com/package/${esc(d)}" target="_blank" rel="noreferrer" class="font-mono text-primary underline-offset-4 hover:underline">${esc(d)}</a></li>`).join("")}${requires.map((r) => `<li><a href="{root}docs/components/${esc(r)}/" class="font-mono text-primary underline-offset-4 hover:underline">${esc(r)}</a>, from this system</li>`).join("")}</ul>`,
    );
  }
  if (c.custom) {
    parts.push(`<p class="mt-12 border-t pt-6 text-sm text-muted-foreground">Written by the team in <code class="font-mono">${esc(c.path ?? `components/${c.file}`)}</code>. The build checks it against the guardrails and never overwrites it.</p>`);
  }
  return { path: `docs/components/${c.name}/`, title: c.title, description: c.description, body: parts.join("\n"), docs: true, toc, previews: !!main };
}

/** A page from the repo's docs/ folder. */
export function customPage(ctx: PageContext, doc: { slug: string; title: string; description: string; body: string }): PageInput {
  const r = renderMarkdown(doc.body, ctx.highlight);
  return { path: doc.slug === "index" ? "docs/" : `docs/${doc.slug}/`, title: doc.title, description: doc.description, body: r.html, docs: true, toc: r.toc };
}
