// A contact sheet per brand animation: five moments of each, side by side, for reviewing a change.
//   npx tsx scripts/motion-sheet.mts [preset] [ids|all] [landscape|square|portrait] [light|dark]
// Writes .auto-design/sheets/<preset>-<format>.png (one row per animation).
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { FORMATS, animationDocument, animationsFor, buildSystem, defaultCopy } from "../packages/core/src/index.ts";
import { presets } from "../packages/presets/src/index.ts";

const require = createRequire(import.meta.url);
const { open, ROOT } = require("./lib/browser.cjs");
const [preset = "quiet", which = "all", format = "landscape", mode = "light"] = process.argv.slice(2);
if (!presets[preset]) throw new Error(`No preset called ${preset}. Use one of: ${Object.keys(presets).join(", ")}`);
const s = buildSystem({ ...presets[preset]!, surfaces: ["web-app", "marketing", "code", "chat", "messaging"] });
const copy = defaultCopy("Northwind", "Project planning for agencies that bill by the hour");
const ids = which === "all" ? animationsFor(s).map((a) => a.id) : which.split(",");
const dir = path.join(ROOT, ".auto-design", "sheets", `${preset}-${format}`);
mkdirSync(dir, { recursive: true });

const f = FORMATS[format as keyof typeof FORMATS];
const scale = 360 / Math.max(f.width, f.height);
const { browser, page, errors, missingFonts } = await open({ width: Math.round(f.width * scale), height: Math.round(f.height * scale) });
const cells: string[] = [];
for (const id of ids) {
  const file = path.join(dir, `${id}.html`);
  writeFileSync(file, animationDocument(s, id, { copy, format: format as never, purpose: "render", mode: mode as never }));
  await page.goto("file://" + file);
  await page.waitForFunction(() => (window as any).__ready === true, null, { timeout: 15000 });
  const duration: number = await page.evaluate(() => (window as any).__duration);
  const row: string[] = [];
  for (const [i, at] of [0.12, 0.3, 0.55, 0.8, 1].entries()) {
    await page.evaluate((t) => (window as any).__seek(t), Math.round(at * duration));
    const shot = path.join(dir, `${id}-${i}.png`);
    await page.screenshot({ path: shot });
    row.push(`<img src="file://${shot}">`);
  }
  cells.push(`<div class="row"><b>${id} · ${(duration / 1000).toFixed(1)}s</b><div>${row.join("")}</div></div>`);
}
const sheet = path.join(dir, "sheet.html");
writeFileSync(sheet, `<!doctype html><style>body{margin:0;padding:12px;background:#777;font:13px system-ui;color:#fff}.row{margin-bottom:12px}.row div{display:flex;gap:6px;margin-top:4px}img{display:block}</style>${cells.join("")}`);
await page.setViewportSize({ width: Math.round(f.width * scale) * 5 + 48, height: 400 });
await page.goto("file://" + sheet);
const out = path.join(ROOT, ".auto-design", "sheets", `${preset}-${format}.png`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
if (missingFonts.size) console.log("Drawn in a fallback face (not in node_modules):", [...missingFonts].join(", "));
console.log(errors.length ? "Page errors:\n" + errors.join("\n") : "No page errors");
console.log("Wrote", out);
