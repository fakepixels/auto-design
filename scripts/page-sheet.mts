// A contact sheet of the five landing page compositions (type, centered, split, full-bleed, editorial) for one
// system, for judging the art direction choices side by side.
//   npx tsx scripts/page-sheet.mts [system] [l|m|s] [light|dark|both] [tag]
// Systems: luxury (a fashion house: ink, a serif display, uppercase labels, a wordmark), store, saas, consumer,
// devtool. IMAGES=/a.jpg,/b.jpg puts photos in the pictures; without them, the kind's object stands in.
// Writes .auto-design/sheets/pages-<system>-<tag>.png.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { HEROES, buildSystem, defaultCopy, googleFontsHref, specimenAssets, specimenData, withKind } from "../packages/core/src/index.ts";
import { applyPatch, type DesignPatch } from "../packages/ai/src/patch.ts";
import { presets } from "../packages/presets/src/index.ts";

const require = createRequire(import.meta.url);
const { open, ROOT } = require("./lib/browser.cjs");
const [which = "luxury", size = "l", modes = "both", tag = "current"] = process.argv.slice(2);

const SYSTEMS: Record<string, { kind: string; product: string; about: string; patch: Partial<DesignPatch> }> = {
  luxury: {
    kind: "ecommerce", product: "Gucci", about: "Italian craftsmanship, made for the way you dress",
    patch: { brand: "#111111", neutral: "neutral", texture: "editorial", fonts: { sans: "inter", mono: "jetbrains-mono", display: "cormorant-garamond" }, radius: 0, imagery: "leading", grid: "open", labels: "uppercase", display: "dramatic", logo: "wordmark" },
  },
  store: {
    kind: "ecommerce", product: "Field Supply", about: "Everyday bags and goods, made to last",
    patch: { brand: "oklch(0.67 0.19 42)", neutral: "warm", texture: "minimal", pairing: "jakarta", radius: 12, imagery: "leading", grid: "cards", labels: "sentence", display: "standard", logo: "mark" },
  },
  saas: {
    kind: "saas", product: "Northwind", about: "Project planning for agencies that bill by the hour",
    patch: { brand: "oklch(0.55 0.21 262)", texture: "minimal", pairing: "geist", radius: 8, imagery: "supporting", grid: "cards", labels: "sentence", display: "standard", logo: "mark" },
  },
  consumer: {
    kind: "consumer", product: "Moonbeam", about: "A calm place for your evening rituals",
    patch: { brand: "oklch(0.7 0.13 320)", texture: "glass", pairing: "fraunces", radius: 16, imagery: "leading", grid: "editorial", labels: "sentence", display: "dramatic", logo: "mark" },
  },
  devtool: {
    kind: "devtool", product: "Relay", about: "Deploy previews for every pull request",
    patch: { brand: "oklch(0.82 0.13 200)", texture: "technical", pairing: "plex", radius: 4, defaultMode: "dark", imagery: "none", grid: "open", labels: "uppercase", display: "standard", logo: "mark" },
  },
};
const sys = SYSTEMS[which];
if (!sys) throw new Error(`Unknown system "${which}". Use one of: ${Object.keys(SYSTEMS).join(", ")}`);

const mime = (f: string) => (f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg");
const images = (process.env.IMAGES ?? "")
  .split(",")
  .filter(Boolean)
  .map((f, i) => ({ src: `data:${mime(f)};base64,${readFileSync(f).toString("base64")}`, alt: `Sample photo ${i + 1}` }));

const copy = withKind(defaultCopy(sys.product, sys.about), sys.kind);
const { css, js } = specimenAssets();
const columns = HEROES.map((hero) => {
  const config = applyPatch({ ...structuredClone(presets.quiet!), name: "sheet", displayName: sys.product, surfaces: ["web-app", "marketing"] } as never, { ...sys.patch, hero });
  const d = specimenData(buildSystem(config));
  return { hero, d };
});
const W = size === "s" ? 420 : 640;
const H = size === "s" ? 340 : null;

const rows: string[] = [];
for (const mode of modes === "both" ? ["dark", "light"] : [modes]) {
  const cells = columns.map((c) => `<div class="cell" style="width:${W}px;${H ? `height:${H}px` : ""}"><div data-hero="${c.hero}" data-mode="${mode}"></div></div>`).join("");
  rows.push(`<section><h2>${which} · ${mode}</h2><div class="cells">${cells}</div></section>`);
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${googleFontsHref(columns[0]!.d)}">
<style>${css}
body { margin: 0; padding: 20px; background: #0b0b0d; font: 13px system-ui; color: #9a9aa2; }
section { margin-bottom: 20px; }
h2 { margin: 0 0 8px; font-size: 12px; font-weight: 500; }
.heads, .cells { display: flex; gap: 12px; align-items: flex-start; }
.heads span { width: ${W}px; font-size: 13px; color: #e6e6ea; }
.cell { border-radius: 14px; overflow: hidden; flex: none; }
.cell > div { height: 100%; }
</style></head><body>
<div class="heads" style="margin-bottom:12px">${HEROES.map((h) => `<span>${h}</span>`).join("")}</div>
${rows.join("")}
<script>${js}</script>
<script>
const COPY = ${JSON.stringify(copy)};
const IMAGES = ${JSON.stringify(images)};
const DATA = ${JSON.stringify(Object.fromEntries(columns.map((c) => [c.hero, c.d]))).replace(/</g, "\\u003c")};
for (const el of document.querySelectorAll("[data-hero]")) {
  AutoDesignSpecimen.render(el, DATA[el.dataset.hero], { mode: el.dataset.mode, copy: COPY, scenes: ["hero"], size: ${JSON.stringify(size)}, images: IMAGES });
}
for (const i of document.images) i.loading = "eager";
Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]).then(() => setTimeout(() => (window.__done = true), 600));
</script></body></html>`;

const dir = path.join(ROOT, ".auto-design", "sheets");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `pages-${which}-${tag}.html`);
writeFileSync(file, html);
const { browser, page, errors, missingFonts } = await open({ width: 40 + HEROES.length * (W + 12), height: 900, scale: Number(process.env.SCALE || 1) });
await page.goto("file://" + file);
await page.waitForFunction(() => (window as any).__done === true, null, { timeout: 30000 });
const out = path.join(dir, `pages-${which}-${tag}.png`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
if (missingFonts.size) console.log("Drawn in a fallback face (not in node_modules):", [...missingFonts].join(", "));
console.log(errors.length ? "Page errors:\n" + errors.join("\n") : "No page errors");
console.log("Wrote", out);
