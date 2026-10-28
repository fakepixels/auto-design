// A "What's new" clip for one update, and the README's dated list of them.
//   npm run video:new -- video/whats-new/entries/2026-10-28-kind-step.json
//   npm run video:new -- --readme       only rebuild the README list from the entries
//
// An entry is a small JSON file (committed, so the list is the record):
//   { "date": "2026-10-28", "title": "A Kind step", "line": "One sentence on what changed.",
//     "shots": [ { "step": "kind", "click": ".proof[data-value=consumer]", "focus": "#vibes" },
//                { "step": "start", "focus": "#start-grid" } ] }
// Each shot opens the real onboarding (no model) at a step, screenshots it, clicks `click` if given and
// screenshots again, and measures `focus` for the camera to push into. One or two shots.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { FONT_CATALOG } from "../../packages/core/src/index.ts";
import { runOnboard } from "../../packages/cli/src/onboard/server.ts";
import { ensureFonts, fontFaces, pkgDir, routeFonts } from "./fonts.mts";
import { ROOT, check, duration, encodeForReadme, hf, longDate, mb, writeBlock } from "./hf.mts";

const require = createRequire(import.meta.url);
const { open } = require("../lib/browser.cjs");
const PROJECT = path.join(ROOT, "video", "whats-new");
const ENTRIES = path.join(PROJECT, "entries");
const OUT = path.join(PROJECT, "assets", "capture");
const MEDIA = path.join(ROOT, "docs", "media", "whats-new");
const PRODUCT = { name: "Moonbeam", description: "A pastel diary for collectors of tiny things", url: "" };

interface Shot { step: string; click?: string; focus?: string; before?: string[] }
interface Entry { date: string; title: string; line: string; shots: Shot[] }
type Box = { x: number; y: number; w: number; h: number; cx: number; cy: number };

const slugOf = (file: string) => path.basename(file, ".json");

async function capture(entry: Entry) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const scratch = path.join(os.tmpdir(), "auto-design-whats-new");
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  delete process.env.AUTO_DESIGN_MOCK_MODEL;
  const cwd = process.cwd();
  process.chdir(scratch);
  const { server, port } = await runOnboard({ port: 4720, open: false, dir: path.join(scratch, "moonbeam-design") });
  process.chdir(cwd);

  // Previews load their faces from Google Fonts, which the sandbox answers from local packages. After a
  // pass, fetch any face a preview used that isn't installed yet, and shoot again so nothing falls back.
  const missing = new Set<string>();
  const shoot = async () => {
    const { browser, page } = await open({ width: 1920, height: 1080, scale: 1.5, scheme: "dark" });
    await routeFonts(page);
    const noteFaces = () =>
      page.evaluate(() => {
        const out = new Set<string>();
        document.querySelectorAll(".sp").forEach((el) => {
          const cs = getComputedStyle(el);
          for (const v of ["--sp-sans", "--sp-display", "--sp-mono"]) {
            const first = cs.getPropertyValue(v).split(",")[0]!.trim().replace(/^["']|["']$/g, "");
            if (first) out.add(first);
          }
        });
        return [...out];
      });
    const note = async () => {
      for (const family of await noteFaces()) {
        const pkg = FONT_CATALOG.find((f) => f.family === family)?.package;
        if (pkg && !pkgDir(pkg)) missing.add(pkg);
      }
    };
    await page.goto(`http://localhost:${port}`, { waitUntil: "networkidle" });
    await page.fill("#p-name", PRODUCT.name);
    await page.fill("#p-desc", PRODUCT.description);
    const current = () => page.evaluate(() => (document.querySelector('.rail button[aria-current="step"]')?.textContent ?? "").trim().toLowerCase());
    const goTo = async (step: string) => {
      for (let i = 0; i < 16 && !(await current()).startsWith(step.toLowerCase()); i++) {
        await page.click("#next");
        await page.waitForTimeout(700);
      }
      if (!(await current()).startsWith(step.toLowerCase())) throw new Error(`Couldn't reach the "${step}" step.`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(900);
    };
    const box = (sel: string): Promise<Box | null> =>
      page.evaluate((s: string) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      }, sel);
    const shots: { click?: Box; focus?: Box }[] = [];
    for (const [i, s] of entry.shots.slice(0, 2).entries()) {
      await goTo(s.step);
      for (const sel of s.before ?? []) { await page.click(sel); await page.waitForTimeout(800); }
      if (s.focus) await page.evaluate((sel: string) => document.querySelector(sel)?.scrollIntoView({ block: "nearest" }), s.focus);
      await page.waitForTimeout(400);
      await note();
      await page.screenshot({ path: path.join(OUT, `shot-${i}a.png`) });
      let click: Box | undefined;
      if (s.click) {
        click = (await box(s.click)) ?? undefined;
        if (!click) throw new Error(`No element matches "${s.click}" on the ${s.step} step.`);
        await page.click(s.click);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1400);
      }
      await note();
      await page.screenshot({ path: path.join(OUT, `shot-${i}b.png`) });
      const focus = s.focus ? ((await box(s.focus)) ?? undefined) : undefined;
      if (s.focus && !focus) throw new Error(`No element matches "${s.focus}" on the ${s.step} step.`);
      shots.push({ click, focus });
    }
    await browser.close();
    return shots;
  };
  let shots = await shoot();
  if (missing.size) {
    ensureFonts([...missing]);
    shots = await shoot();
  }
  server.close();
  if (shots.length === 1) for (const x of ["a", "b"]) copyFileSync(path.join(OUT, `shot-0${x}.png`), path.join(OUT, `shot-1${x}.png`));

  // The clip's own files: GSAP, the film's chrome, Inter and Geist Mono.
  copyFileSync(path.join(ROOT, "node_modules", "gsap", "dist", "gsap.min.js"), path.join(OUT, "gsap.min.js"));
  copyFileSync(path.join(ROOT, "video", "lib", "film.css"), path.join(OUT, "film.css"));
  ensureFonts(["@fontsource-variable/inter", "@fontsource-variable/geist-mono"]);
  writeFileSync(path.join(OUT, "fonts.css"), fontFaces("@fontsource-variable/inter", [400, 500, 600], OUT) + fontFaces("@fontsource-variable/geist-mono", [500], OUT));
  const data = { title: entry.title, line: entry.line, date: entry.date, dateLabel: longDate(entry.date), shots };
  writeFileSync(path.join(OUT, "new.js"), `window.__NEW = ${JSON.stringify(data)};\n`);
}

/** The README's list: the newest clip plays inline, every entry links to its video. */
function writeReadme() {
  const entries = existsSync(ENTRIES)
    ? readdirSync(ENTRIES).filter((f) => f.endsWith(".json")).map((f) => ({ slug: slugOf(f), ...(JSON.parse(readFileSync(path.join(ENTRIES, f), "utf8")) as Entry) }))
    : [];
  const made = entries.filter((e) => existsSync(path.join(MEDIA, `${e.slug}.mp4`))).sort((a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug));
  if (!made.length) return;
  const top = made[0]!;
  const rel = (e: { slug: string }, ext: string) => `docs/media/whats-new/${e.slug}.${ext}`;
  const body = [
    `<a href="${rel(top, "mp4")}"><img src="${rel(top, "webp")}" width="640" alt="${top.title}: ${top.line.replace(/"/g, "&quot;")}"></a>`,
    "",
    ...made.map((e) => `- **${longDate(e.date)}: ${e.title}.** ${e.line} [Watch](${rel(e, "mp4")})`),
  ];
  writeBlock("whats-new", body.join("\n"));
  console.log(`Updated the README's What's new list (${made.length} entr${made.length === 1 ? "y" : "ies"}).`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--readme")) return writeReadme();
  const file = args.find((a) => a.endsWith(".json"));
  if (!file) throw new Error("Pass an entry file: npm run video:new -- video/whats-new/entries/<date>-<name>.json");
  const entry = JSON.parse(readFileSync(path.resolve(ROOT, file), "utf8")) as Entry;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !entry.title || !entry.line || !entry.shots?.length) throw new Error("An entry needs a date (YYYY-MM-DD), a title, a line and one or two shots.");
  const slug = slugOf(file);
  console.log(`Capturing "${entry.title}"…`);
  await capture(entry);
  console.log("Checking the clip…");
  check(PROJECT);
  console.log("Rendering…");
  mkdirSync(path.join(PROJECT, "renders"), { recursive: true });
  const master = path.join(PROJECT, "renders", `${slug}.mp4`);
  if (!hf(PROJECT, ["render", "--quality", "delivery", "--output", master]).ok) throw new Error("Render failed.");
  if (!(duration(master) > 12)) throw new Error("The clip rendered too short.");
  mkdirSync(MEDIA, { recursive: true });
  const mp4 = path.join(MEDIA, `${slug}.mp4`), webp = path.join(MEDIA, `${slug}.webp`);
  encodeForReadme(master, mp4, webp, { width: 640, fps: 15, quality: 60 });
  console.log(`  docs/media/whats-new/${slug}.mp4 ${mb(mp4)}, ${slug}.webp ${mb(webp)}`);
  writeReadme();
}

main().then(() => process.exit(0), (e) => { console.error((e as Error).message); process.exit(1); });
