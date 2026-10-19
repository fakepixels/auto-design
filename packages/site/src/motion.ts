import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  FORMATS,
  animationDefaults,
  animationStage,
  animationsFor,
  motionCss,
  motionLanguage,
  motionRuntime,
  type AnimationInfo,
  type DesignSystem,
  type SpecimenCopy,
} from "@auto-design/core";
import { buildSync } from "esbuild";
import type { PageInput } from "./shell.js";
import { command, esc, h2, inlineCode, p, tabs, type TocItem } from "./ui.js";

/**
 * The Motion section of the design site: every brand animation the system can
 * make, playing in the product's own words, with a player that edits the words,
 * switches format and mode, and hands over the command that renders a video.
 */

const require = createRequire(import.meta.url);

function asset(name: string): string | null {
  for (const rel of [`./${name}`, `./site/${name}`]) {
    const url = new URL(rel, import.meta.url);
    if (existsSync(url)) return readFileSync(url, "utf8");
  }
  return null;
}

/** The templates as a browser script (window.ADMotionTemplates), so the player can redraw with new words. */
export function templatesBundle(): string {
  const prebuilt = asset("motion-templates.js");
  if (prebuilt) return prebuilt;
  // In the monorepo: build it from the core sources.
  const core = dirname(require.resolve("@auto-design/core"));
  const r = buildSync({
    entryPoints: [join(core, "motion", "templates.ts")],
    bundle: true,
    format: "iife",
    globalName: "ADMotionTemplates",
    minify: true,
    write: false,
    legalComments: "none",
    logLevel: "silent",
  });
  return r.outputFiles[0]!.text;
}

/** What the player needs to redraw an animation in the browser. */
function playerData(s: DesignSystem, copy: SpecimenCopy, a: AnimationInfo) {
  return {
    id: a.id,
    fields: a.fields,
    defaults: animationDefaults(a.id, s, copy),
    copy,
    // Only what the templates read: the scenes and their timing.
    system: { config: s.config, motion: s.motion },
  };
}

const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export interface MotionPages {
  pages: PageInput[];
  files: Record<string, string>;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function motionPages(s: DesignSystem, copy: SpecimenCopy): MotionPages {
  const list = animationsFor(s);
  const lang = motionLanguage(s);
  const stage = (id: string, format: "landscape" | "square" | "portrait" = "landscape") => animationStage(s, id, { copy, format, mode: "inherit" });
  const durationOf = (html: string) => Number(/data-duration="(\d+)"/.exec(html)?.[1] ?? 0);

  const facts: [string, string][] = [
    ["Profile", `${s.motion.name.charAt(0).toUpperCase()}${s.motion.name.slice(1)}`],
    ["Entrance", `${lang.beat}ms${lang.travel ? `, rising ${lang.travel}% of the frame` : ", fades only"}`],
    ["Sequence", `${lang.stagger}ms between items`],
    ["Easing", lang.spring.startsWith("linear(") ? "A spring for arrivals, ease-out for the rest" : "Ease-out for arrivals, ease-in-out for moves"],
  ];

  const index: PageInput = {
    path: "motion/",
    title: "Motion",
    description: `Brand animations built from ${s.config.displayName}: its colors, type, corners and motion. Each plays in the product's own words and renders to video.`,
    motion: true,
    body: `
<section class="mx-auto max-w-7xl px-4 pb-10 pt-12 md:px-6 md:pt-16">
  <h1 class="text-3xl font-semibold tracking-tight md:text-4xl">Motion</h1>
  <p class="mt-3 max-w-2xl text-lg text-muted-foreground">Brand animations made from the system itself: the same colors, type, corners and motion as the product. Edit the words, pick a format, and render a video with one command.</p>
  <dl class="mt-8 grid overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4">
    ${facts.map(([k, v], i) => `<div class="p-5 ${i ? "border-t sm:border-t-0" : ""} ${i % 2 ? "sm:border-l" : ""} ${i >= 2 ? "sm:border-t lg:border-t-0" : ""} ${i ? "lg:border-l" : ""}"><dt class="text-sm text-muted-foreground">${k}</dt><dd class="mt-1 text-sm font-medium">${esc(v)}</dd></div>`).join("")}
  </dl>
</section>
<section class="mx-auto max-w-7xl px-4 pb-16 md:px-6" aria-label="Animations">
  <div class="grid gap-6 md:grid-cols-2">
    ${list
      .map((a) => {
        const html = stage(a.id);
        return `<a href="{root}motion/${a.id}/" class="group block overflow-hidden rounded-xl border bg-card transition-colors hover:border-ring">
      <div class="overflow-hidden border-b">${html}</div>
      <div class="flex items-start justify-between gap-4 p-4">
        <div><p class="text-sm font-medium">${esc(a.title)}</p><p class="mt-1 text-sm text-muted-foreground">${esc(a.description)}</p></div>
        <span class="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">${a.loop ? "Loop" : seconds(durationOf(html))}</span>
      </div>
    </a>`;
      })
      .join("\n")}
  </div>
</section>`,
  };

  const pages: PageInput[] = [index];
  for (const a of list) {
    const html = stage(a.id);
    const data = playerData(s, copy, a);
    const toc: TocItem[] = [
      { id: "words", text: "Words", level: 2 },
      { id: "use", text: "Use it", level: 2 },
    ];
    const formats = Object.entries(FORMATS)
      .map(([k, f], i) => `<button type="button" data-format="${k}" aria-pressed="${i === 0}" class="h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs">${f.label}</button>`)
      .join("");
    const modes =
      s.config.color.modes === "both"
        ? `<div class="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label="Color mode"><button type="button" data-mode="inherit" aria-pressed="true" class="h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs">Page</button><button type="button" data-mode="light" aria-pressed="false" class="h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs">Light</button><button type="button" data-mode="dark" aria-pressed="false" class="h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs">Dark</button></div>`
        : "";
    const fields = a.fields
      .map((f) => {
        const v = data.defaults[f.key];
        const value = Array.isArray(v) ? v.join("\n") : (v ?? "");
        return `<label class="grid gap-1.5 text-sm"><span class="font-medium">${esc(f.label)}</span>${
          f.kind === "list"
            ? `<textarea data-field="${f.key}" data-list rows="4" class="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">${esc(value)}</textarea>`
            : `<input data-field="${f.key}" value="${esc(String(value))}" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">`
        }</label>`;
      })
      .join("");
    const cmd = `npx auto-design animate ${a.id} --out ${a.id}.mp4`;
    const use = tabs(`use-${a.id}`, [
      {
        label: "Video",
        panel: `<p class="mb-3 text-sm text-muted-foreground">Renders every frame in the system's own type and colors, in the words and format above. MP4, WebM and GIF need ffmpeg; HTML and PNG frames don't.</p><div data-command>${command(esc(cmd), cmd)}</div>`,
      },
      {
        label: "HTML",
        panel: `<p class="mb-3 text-sm text-muted-foreground">One self-contained file that plays in any browser. Embed it in an iframe, or open it and record your screen.</p><button type="button" data-download class="inline-flex h-${s.controls.md} items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent">Download ${esc(a.id)}.html</button>`,
      },
      {
        label: "Agents",
        panel: `<p class="mb-3 text-sm text-muted-foreground">Coding agents call the MCP server's ${inlineCode("render_animation")} tool with the same words, and get a file back.</p>${command(esc(`render_animation { "id": "${a.id}", "format": "landscape", "out": "${a.id}.mp4" }`), `render_animation { "id": "${a.id}", "format": "landscape", "out": "${a.id}.mp4" }`)}`,
      },
    ]);
    pages.push({
      path: `motion/${a.id}/`,
      title: a.title,
      description: a.description,
      motion: true,
      docs: true,
      toc,
      body: `
<div data-player class="overflow-hidden rounded-xl border bg-card">
  <div data-stage-box class="flex justify-center bg-muted">${html.replace('class="adm-stage', 'class="adm-stage w-full')}</div>
  <div class="flex flex-wrap items-center gap-3 border-t p-3">
    <button type="button" data-play aria-label="Pause" class="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"><svg data-icon-pause viewBox="0 0 24 24" class="size-4" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg><svg data-icon-play hidden viewBox="0 0 24 24" class="size-4" fill="currentColor" aria-hidden="true"><path d="M7 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L8.5 4.64A1 1 0 0 0 7 5.5z"/></svg></button>
    <input data-scrub type="range" min="0" max="${durationOf(html)}" value="0" step="10" aria-label="Time" class="h-1 min-w-32 flex-1 accent-primary">
    <span data-time class="w-24 whitespace-nowrap text-right font-mono text-xs tabular-nums text-muted-foreground">0.0s</span>
    <div class="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label="Format">${formats}</div>
    ${modes}
  </div>
</div>
${h2("words", "Words")}
${p("The animation redraws as you type. Lists take one item per line.")}
<div class="mt-4 grid gap-4 sm:grid-cols-2">${fields}</div>
${h2("use", "Use it")}
<div class="mt-4">${use}</div>
<script type="application/json" id="adm-data">${json(data)}</script>`,
    });
  }

  return {
    pages,
    files: {
      "_site/motion.css": motionCss(s),
      "_site/motion-runtime.js": motionRuntime(),
      "_site/motion-templates.js": templatesBundle(),
      "_site/motion-player.js": asset("motion-player.js") ?? "",
    },
  };
}

/** The home page's motion moment: the launch film, playing in the product's words. */
export function homeMotion(s: DesignSystem, copy: SpecimenCopy): string {
  const html = animationStage(s, "launch", { copy, format: "landscape", mode: "inherit" });
  return `<section class="mx-auto max-w-7xl px-4 pb-16 md:px-6" aria-label="In motion">
  <div class="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <a href="motion/launch/" class="block overflow-hidden rounded-xl border">${html}</a>
    <div>
      <h2 class="text-xl font-semibold tracking-tight">In motion</h2>
      <p class="mt-2 text-muted-foreground">A launch film made from the same colors, type and motion as the product. Edit the words and render it to video, or pick from ${animationsFor(s).length - 1} other animations.</p>
      <a href="motion/" class="mt-4 inline-flex h-${s.controls.md} items-center rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">See all animations</a>
    </div>
  </div>
</section>`;
}
