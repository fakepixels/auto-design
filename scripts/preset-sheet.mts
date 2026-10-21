// A contact sheet of every preset on the onboarding specimens, for reviewing taste changes.
//   npx tsx scripts/preset-sheet.mts [presets|all] [light|dark|both] [tag]
// Writes .auto-design/sheets/presets-<tag>.png: one row per preset, the same scenes onboarding shows.
// VARIANTS='[{"label":"Tactile coral","base":"tactile","color":{"brand":"#e8603c"}}]' draws trial configs instead.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { buildSystem, defaultCopy, googleFontsHref, pairingFonts, specimenAssets, specimenData } from "../packages/core/src/index.ts";
import { presets } from "../packages/presets/src/index.ts";

const require = createRequire(import.meta.url);
const { open, ROOT } = require("./lib/browser.cjs");
const [which = "all", modes = "both", tag = "current"] = process.argv.slice(2);
const names = which === "all" ? Object.keys(presets) : which.split(",");
const copy = defaultCopy("Northwind", "Project planning for agencies that bill by the hour");
const { css, js } = specimenAssets();

const SCENES: [string, number, number][] = [
  ["hero", 460, 330],
  ["app", 620, 330],
  ["surfaces", 420, 330],
  ["controls", 360, 330],
  ["motion", 420, 330],
];

const rows: string[] = [];
const fonts = new Set<string>();
type Variant = { label: string; base: string; color?: object; type?: object; pairing?: string; [k: string]: unknown };
const variants: Variant[] = process.env.VARIANTS ? JSON.parse(process.env.VARIANTS) : names.map((n) => ({ label: "", base: n }));
for (const v of variants) {
  const p = presets[v.base]!;
  const { label, base, color, type, pairing, ...rest } = v;
  const s = buildSystem({ ...p, ...rest, color: { ...p.color, ...(color ?? {}) }, type: { ...p.type, ...(pairing ? pairingFonts(pairing) : {}), ...(type ?? {}) }, surfaces: ["web-app", "marketing", "code", "chat", "messaging"] } as never);
  const name = label || base;
  const d = specimenData(s);
  fonts.add(googleFontsHref(d));
  for (const mode of modes === "both" ? ["light", "dark"] : [modes]) {
    const cells = SCENES.map(([scene, w, h], i) => `<div class="cell" style="width:${w}px;height:${h}px"><div data-scene="${scene}"></div></div>`).join("");
    rows.push(`<section data-preset="${name}" data-mode="${mode}"><h2>${label || d.displayName} · ${mode}</h2><div class="cells">${cells}</div><script type="application/json">${JSON.stringify(d).replace(/</g, "\\u003c")}</script></section>`);
  }
}

const html = `<!doctype html><html><head><meta charset="utf-8">
${[...fonts].map((f) => `<link rel="stylesheet" href="${f}">`).join("\n")}
<style>${css}
body { margin: 0; padding: 20px; background: #8a8d93; font: 13px system-ui; color: #fff; }
section { margin-bottom: 18px; }
h2 { margin: 0 0 8px; font-size: 13px; font-weight: 600; }
.cells { display: flex; gap: 10px; }
.cell { border-radius: 12px; overflow: hidden; flex: none; background: #fff; }
.cell > div { height: 100%; }
</style></head><body>${rows.join("")}
<script>${js}</script>
<script>
const COPY = ${JSON.stringify(copy)};
for (const sec of document.querySelectorAll("section")) {
  const d = JSON.parse(sec.querySelector("script").textContent);
  for (const el of sec.querySelectorAll("[data-scene]")) {
    AutoDesignSpecimen.render(el, d, { mode: sec.dataset.mode, copy: COPY, scenes: [el.dataset.scene], size: "m" });
  }
}
// Hold the motion scene on its last frame.
for (const st of document.querySelectorAll(".sp-stage")) { st.classList.add("play"); }
document.fonts.ready.then(() => setTimeout(() => (window.__done = true), 1600));
</script></body></html>`;

const dir = path.join(ROOT, ".auto-design", "sheets");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `presets-${tag}.html`);
writeFileSync(file, html);
const { browser, page, errors, missingFonts } = await open({ width: 2400, height: 900, scale: Number(process.env.SCALE || 1) });
await page.goto("file://" + file);
await page.waitForFunction(() => (window as any).__done === true, null, { timeout: 20000 });
const out = path.join(dir, `presets-${tag}.png`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
if (missingFonts.size) console.log("Drawn in a fallback face (not in node_modules):", [...missingFonts].join(", "));
console.log(errors.length ? "Page errors:\n" + errors.join("\n") : "No page errors");
console.log("Wrote", out);
