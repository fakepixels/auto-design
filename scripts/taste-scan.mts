// A measuring stick for auto-design's own screens: runs impeccable's detector (pbakaus/impeccable, Apache 2.0,
// pinned below and fetched through npx, never a dependency) on onboarding, the landing page and auto-design's
// own design site, in dark and light mode, at desktop and phone widths.
//
//   npx tsx scripts/taste-scan.mts [onboarding,landing,site|all] [dark|light|both] [desktop|phone|both]
//
// Each page is opened in Chromium the way a reader sees it (fonts served locally, the mode set the way each
// page sets it, entrance animations finished), then the detector reads that page through Chromium's DevTools
// port. The landing page needs `npm run landing` first. Prints findings by rule and writes the full JSON to
// the temp folder. Telemetry is off (DO_NOT_TRACK).
import { execFile } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runOnboard } from "../packages/cli/src/onboard/server.ts";

const IMPECCABLE = "impeccable@4.8.0";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(ROOT, "node_modules", "playwright"));
const { routeFonts, chromiumPath } = require("./lib/browser.cjs");

const [which = "all", modeArg = "both", widthArg = "both"] = process.argv.slice(2);
const surfaces = which === "all" ? ["onboarding", "landing", "site"] : which.split(",");
const modes = (modeArg === "both" ? ["dark", "light"] : [modeArg]) as ("dark" | "light")[];
const widths = widthArg === "both" ? ["desktop", "phone"] : [widthArg];
const SIZE: Record<string, { width: number; height: number }> = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

const TYPES: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".mp4": "video/mp4", ".txt": "text/plain", ".md": "text/markdown" };

function serve(dir: string): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    let p = path.join(dir, decodeURIComponent(new URL(req.url || "/", "http://x").pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!p.startsWith(dir) || !existsSync(p)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
    createReadStream(p).pipe(res);
  });
  return new Promise((ok) => server.listen(0, () => ok({ url: `http://localhost:${(server.address() as { port: number }).port}/`, close: () => server.close() })));
}

function detect(port: number, target: string): Promise<Finding[]> {
  return new Promise((ok, fail) => {
    execFile("npx", ["-y", IMPECCABLE, "detect", "--json", "--cdp", String(port), "--target", target],
      { env: { ...process.env, DO_NOT_TRACK: "1" }, maxBuffer: 64 * 1024 * 1024, timeout: 240_000 },
      (err, stdout, stderr) => {
        // Exit 2 means findings; 1 means the page couldn't be scanned.
        if (err && (err as { code?: number }).code !== 2) return fail(new Error(stderr || err.message));
        try { ok(JSON.parse(stdout || "[]")); } catch { fail(new Error("Unreadable detector output:\n" + stdout.slice(0, 400))); }
      });
  });
}

interface Finding { antipattern: string; name: string; severity: string; category: string; snippet?: string; selector?: string }

const stop: (() => void)[] = [];
const pages: Record<string, string> = {};
if (surfaces.includes("onboarding")) {
  const { server, port } = await runOnboard({ port: 4760, open: false, dir: path.join(os.tmpdir(), `ad-taste-${Date.now()}`) });
  pages.onboarding = `http://localhost:${port}/`;
  stop.push(() => server.close());
}
if (surfaces.includes("landing")) {
  const dist = path.join(ROOT, "landing", "dist");
  if (!existsSync(path.join(dist, "index.html"))) console.log("Skipping the landing page: run npm run landing first.");
  else { const s = await serve(dist); pages.landing = s.url; stop.push(s.close); }
}
if (surfaces.includes("site")) { const s = await serve(path.join(ROOT, "brand", "public")); pages.site = s.url; stop.push(s.close); }

const port = 9300 + Math.floor(Math.random() * 500);
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-proxy-server", `--remote-debugging-port=${port}`] });
const results: { surface: string; mode: string; width: string; findings: Finding[] }[] = [];
for (const [surface, url] of Object.entries(pages)) {
  for (const mode of modes) {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: SIZE[width], colorScheme: mode });
      await routeFonts(page);
      const tagged = `${url}?scan=${surface}-${mode}-${width}`;
      await page.goto(tagged, { waitUntil: "networkidle" });
      // Pages that follow a class rather than the media query (the design site and the landing page).
      await page.evaluate((m: string) => {
        const r = document.documentElement, cls = r.dataset.modeClass;
        if (cls) r.classList.toggle(cls, cls === m);
      }, mode);
      await page.waitForTimeout(800);
      // Scan the resting state, not an entrance caught halfway.
      await page.evaluate(() => { for (const a of document.getAnimations()) { try { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); } catch {} } });
      await page.waitForTimeout(200);
      let findings: Finding[] = [];
      try { findings = await detect(port, tagged); } catch (e) { console.log(`${surface} ${mode} ${width}: could not scan (${(e as Error).message.split("\n")[0]})`); }
      results.push({ surface, mode, width, findings });
      await page.close();
    }
  }
}
await browser.close();
for (const s of stop) s();

const out = path.join(os.tmpdir(), "auto-design-taste-scan");
mkdirSync(out, { recursive: true });
const file = path.join(out, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(results, null, 2));

let total = 0;
for (const r of results) {
  const byRule = new Map<string, Finding[]>();
  for (const f of r.findings) byRule.set(f.antipattern, [...(byRule.get(f.antipattern) || []), f]);
  total += r.findings.length;
  console.log(`\n${r.surface}, ${r.mode}, ${r.width}: ${r.findings.length ? `${r.findings.length} finding${r.findings.length === 1 ? "" : "s"}` : "clean"}`);
  for (const [rule, list] of byRule) {
    const where = [...new Set(list.map((f) => f.selector).filter(Boolean))].slice(0, 3).join(", ");
    console.log(`  ${rule} ×${list.length}  ${list[0].snippet || ""}${where ? `  (${where})` : ""}`);
  }
}
console.log(`\n${total} finding${total === 1 ? "" : "s"} in all. Full results: ${file}`);
