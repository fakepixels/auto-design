// A contact sheet of the five textures on the objects onboarding previews, for judging whether they read apart.
//   npx tsx scripts/texture-sheet.mts [light|dark|both] [tag]
// Writes .auto-design/sheets/textures-<tag>.png: one row per object (decision, agent, store, moment) and mode,
// one column per texture, everything else held the same, as on the Texture step.
// BASE='{"brand":"oklch(0.55 0.21 292)","pairing":"inter","radius":12}' changes what's held constant.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { TEXTURES, buildSystem, defaultCopy, googleFontsHref, pairingFonts, specimenAssets, specimenData } from "../packages/core/src/index.ts";
import { presets } from "../packages/presets/src/index.ts";

const require = createRequire(import.meta.url);
const { open, ROOT } = require("./lib/browser.cjs");
const [modes = "both", tag = "current"] = process.argv.slice(2);
const base = { brand: "oklch(0.55 0.21 292)", pairing: "inter", radius: 12, ...(process.env.BASE ? JSON.parse(process.env.BASE) : {}) };
const copy = defaultCopy("Kitty Land", "Invoices that send themselves");
const { css, js } = specimenAssets();
const OBJECTS = ["object", "agent", "shop", "moment"];
const W = 330;
const H = 260;

const fonts = new Set<string>();
const columns = TEXTURES.map((texture) => {
  const p = presets.quiet!;
  const s = buildSystem({
    ...p,
    texture,
    color: { ...p.color, brand: base.brand },
    type: { ...p.type, ...pairingFonts(base.pairing) },
    shape: { radius: base.radius },
    surfaces: ["web-app", "marketing", "chat"],
  } as never);
  const d = specimenData(s);
  fonts.add(googleFontsHref(d));
  return { texture, d };
});

const rows: string[] = [];
for (const mode of modes === "both" ? ["light", "dark"] : [modes]) {
  for (const scene of OBJECTS) {
    const cells = columns.map((c) => `<div class="cell" style="width:${W}px;height:${H}px"><div data-scene="${scene}" data-texture-col="${c.texture}" data-mode="${mode}"></div></div>`).join("");
    rows.push(`<section><h2>${scene} · ${mode}</h2><div class="cells">${cells}</div></section>`);
  }
}

const html = `<!doctype html><html><head><meta charset="utf-8">
${[...fonts].map((f) => `<link rel="stylesheet" href="${f}">`).join("\n")}
<style>${css}
body { margin: 0; padding: 20px; background: #0b0b0d; font: 13px system-ui; color: #9a9aa2; }
section { margin-bottom: 16px; }
h2 { margin: 0 0 8px; font-size: 12px; font-weight: 500; }
.heads, .cells { display: flex; gap: 12px; }
.heads span { width: ${W}px; font-size: 13px; color: #e6e6ea; }
.cell { border-radius: 14px; overflow: hidden; flex: none; }
.cell > div { height: 100%; }
</style></head><body>
<div class="heads" style="margin-bottom:12px">${TEXTURES.map((t) => `<span>${t}</span>`).join("")}</div>
${rows.join("")}
<script>${js}</script>
<script>
const COPY = ${JSON.stringify(copy)};
const DATA = ${JSON.stringify(Object.fromEntries(columns.map((c) => [c.texture, c.d]))).replace(/</g, "\\u003c")};
for (const el of document.querySelectorAll("[data-scene]")) {
  AutoDesignSpecimen.render(el, DATA[el.dataset.textureCol], { mode: el.dataset.mode, copy: COPY, scenes: [el.dataset.scene], size: "s" });
}
document.fonts.ready.then(() => setTimeout(() => (window.__done = true), 800));
</script></body></html>`;

const dir = path.join(ROOT, ".auto-design", "sheets");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `textures-${tag}.html`);
writeFileSync(file, html);
const { browser, page, errors, missingFonts } = await open({ width: 40 + TEXTURES.length * (W + 12), height: 900, scale: Number(process.env.SCALE || 1.5) });
await page.goto("file://" + file);
await page.waitForFunction(() => (window as any).__done === true, null, { timeout: 20000 });
const out = path.join(dir, `textures-${tag}.png`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
if (missingFonts.size) console.log("Drawn in a fallback face (not in node_modules):", [...missingFonts].join(", "));
console.log(errors.length ? "Page errors:\n" + errors.join("\n") : "No page errors");
console.log("Wrote", out);
