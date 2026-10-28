// Gathers everything the product film draws, fresh from the current code, into video/assets/capture/.
//   npx tsx scripts/video/capture.mts
//
// It runs the real onboarding server (no model), makes the film's choices through its API, publishes the
// Moonbeam system to a scratch folder (no GitHub, no hosting), screenshots that system's design site and
// renders its brand animation with `auto-design animate`. The film itself (video/index.html) draws the
// hero card with the product's own renderer from the specimens saved here, so it can't show a screen the
// product no longer has.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { specimenAssets } from "../../packages/core/src/index.ts";
import { runOnboard } from "../../packages/cli/src/onboard/server.ts";
import { runAnimate } from "../../packages/cli/src/animate.ts";
import { FONT_CACHE, addFamilies, ensureFonts, fontFaces, routeFonts } from "./fonts.mts";

const require = createRequire(import.meta.url);
const { ROOT, open, chromiumPath } = require("../lib/browser.cjs");
const OUT = path.join(ROOT, "video", "assets", "capture");
const SCRATCH = path.join(os.tmpdir(), "auto-design-film");

/** The film's choices. Change them here; the film reads whatever this script saves. */
export const FILM = {
  product: { name: "Moonbeam", description: "A pastel diary for collectors of tiny things" },
  kind: "consumer",
  // Clicked in order on the vibe row; the last one is where the film lands.
  vibes: ["luxury", "scifi", "playful", "dreamy"],
  palette: "ocean",
  // The type row shows these four pairings; the film picks `pairing`.
  pairings: ["fraunces", "instrument", "bricolage", "fredoka"],
  pairing: "instrument",
  surfaces: ["web-app", "marketing", "chat", "code", "mcp-apps", "messaging"],
};

type Json = Record<string, any>;
const log = (s: string) => console.log(`  ${s}`);

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(path.join(OUT, "fonts"), { recursive: true });
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });
  if (!process.env.AUTO_DESIGN_CHROMIUM && chromiumPath()) process.env.AUTO_DESIGN_CHROMIUM = chromiumPath();

  // 1. The real onboarding, driven through its own API.
  delete process.env.AUTO_DESIGN_MOCK_MODEL;
  const cwd = process.cwd();
  process.chdir(SCRATCH);
  const { server, port } = await runOnboard({ port: 4710, open: false, dir: path.join(SCRATCH, "moonbeam-design") });
  process.chdir(cwd);
  const base = `http://localhost:${port}`;
  const api = async (p: string, body?: Json): Promise<any> => {
    const r = await fetch(base + p, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(`${p}: ${j.error ?? r.status}`);
    return j;
  };
  const snap = (v: Json, extra: Json = {}) => ({ specimen: v.specimen, copy: v.copy, kind: v.kind, vibe: v.vibe, ...extra });

  await api("/api/product", { ...FILM.product, url: "" });
  const start = snap(await api("/api/state"), { scene: "object" });
  log(`start: ${start.specimen.texture}, ${start.specimen.seedHex}`);

  // Kind: the row the film shows, then the click.
  const kinds = (await api("/api/variants", { field: "kind" })).map((v: Json) => ({ value: v.value, name: v.name, note: v.note, scene: v.scene, specimen: v.specimen }));
  const kinded = snap(await api("/api/kind", { kind: FILM.kind }), { scene: "moment" });

  // Vibe: the row, then a click on each in turn. Every state is what that click really produces.
  const vibeRow = (await api("/api/variants", { field: "vibe" })).map((v: Json) => ({ value: v.value, name: v.name, note: v.note, specimen: v.specimen }));
  const vibeStates: Json[] = [];
  for (const vibe of FILM.vibes) vibeStates.push({ vibe, ...snap(await api("/api/kind", { kind: FILM.kind, vibe }), { scene: "moment" }) });

  // Color: the palettes the Color step offers, then one of them.
  const brandRow = (await api("/api/variants", { field: "brand" })).filter((v: Json) => v.specimen);
  const palettes = brandRow.slice(0, 9).map((v: Json) => {
    const b = v.specimen.palettes.brand;
    const k = b.findIndex((x: Json) => x.step === v.specimen.seedStep);
    const at = (j: number) => b[Math.max(0, Math.min(b.length - 1, j))].css;
    return { value: v.value, name: v.name, hex: v.specimen.seedHex, strip: [k - 4, k - 2, k, k + 2, k + 4].map(at) };
  });
  const pick = brandRow.find((v: Json) => v.value === FILM.palette);
  if (!pick) throw new Error(`No palette "${FILM.palette}" on the Color step.`);
  const colored = snap(await api("/api/choose", { patch: pick.patch, label: `Color: ${pick.name}` }), { scene: "moment" });

  // Type: four pairings on the current system, then the pick.
  const pairingRow = (await api("/api/variants", { field: "pairing" }))
    .filter((v: Json) => FILM.pairings.includes(v.value))
    .sort((a: Json, b: Json) => FILM.pairings.indexOf(a.value) - FILM.pairings.indexOf(b.value))
    .map((v: Json) => ({ value: v.value, name: v.name, note: v.note, specimen: v.specimen }));
  const typed = snap(await api("/api/choose", { patch: { pairing: FILM.pairing }, label: "Type" }), { scene: "moment" });

  // Surfaces, then publish without GitHub or hosting.
  const final = snap(await api("/api/surfaces", { surfaces: FILM.surfaces }), { scene: "moment" });
  const pub = await api("/api/publish", { dir: path.join(SCRATCH, "moonbeam-design"), displayName: FILM.product.name, github: "none", hosting: "later" });
  for (const s of pub.steps) log(`${s.ok ? "✓" : "✗"} ${s.step}: ${s.detail}`);
  const sysDir: string = path.isAbsolute(pub.relDir) ? pub.relDir : path.join(SCRATCH, pub.relDir);

  // 2. Fonts: every family any state uses, plus the onboarding's Inter, as local files.
  const families = new Map<string, { family: string; pkg: string; weights: number[] }>();
  const add = (sp: Json) => addFamilies(families, sp);
  for (const st of [start, kinded, ...vibeStates, colored, typed, final]) add(st.specimen);
  for (const row of [kinds, vibeRow, pairingRow]) for (const v of row) add(v.specimen);
  families.set("@fontsource-variable/inter", { family: "Inter Variable", pkg: "@fontsource-variable/inter", weights: [400, 500, 600] });
  families.set("@fontsource-variable/geist-mono", { family: "Geist Mono Variable", pkg: "@fontsource-variable/geist-mono", weights: [400, 500] });
  ensureFonts([...families.keys()]);
  const fontCss = [...families.values()].map((f) => fontFaces(f.pkg, f.weights, OUT)).join("\n");
  writeFileSync(path.join(OUT, "fonts.css"), fontCss);
  log(`fonts: ${[...families.values()].map((f) => f.family).join(", ")}`);

  // The published repo has the fonts in its package.json but no node_modules; point it at the cache so
  // `auto-design animate` renders in the real faces offline.
  const sysModules = path.join(sysDir, "node_modules");
  if (!existsSync(sysModules)) symlinkSync(path.join(FONT_CACHE, "node_modules"), sysModules, "dir");

  // 3. The design site, from the top of the home page, at 1.5x: the film shows it at 1.5x, and a larger
  //    image is slow enough to decode that frames can catch it missing.
  const site = `${base}/site/`;
  const mode = final.specimen.defaultMode;
  const { browser, page } = await open({ width: 1920, height: 1080, scale: 1.5, scheme: mode });
  await routeFonts(page);
  await page.goto(site, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const siteH = Math.min(2400, await page.evaluate(() => document.documentElement.scrollHeight));
  await page.setViewportSize({ width: 1920, height: siteH });
  await page.waitForTimeout(400);
  // Where the site plays the brand animation: the film zooms through this player into the animation.
  const player = await page.evaluate(() => {
    const el = document.querySelector('section[aria-label="In motion"] a[href*="motion/"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  });
  await page.screenshot({ path: path.join(OUT, "site.png") });
  await browser.close();
  log(`site: 1920 x ${siteH}${player ? `, player at ${Math.round(player.x)},${Math.round(player.y)} ${Math.round(player.w)}x${Math.round(player.h)}` : ", no player found"}`);

  // 4. The system's own launch animation, rendered by auto-design.
  const anim = await runAnimate({ cwd: sysDir, id: "launch", format: "landscape", out: path.join(OUT, "brand.mp4"), quiet: true });
  log(`brand animation: ${(anim.duration / 1000).toFixed(1)}s`);

  server.close();

  // 5. The renderer and GSAP, copied so the film runs offline and always matches the product.
  const { css, js } = specimenAssets();
  writeFileSync(path.join(OUT, "renderer.css"), css);
  writeFileSync(path.join(OUT, "renderer.js"), js);
  copyFileSync(path.join(ROOT, "node_modules", "gsap", "dist", "gsap.min.js"), path.join(OUT, "gsap.min.js"));

  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const data = {
    film: FILM,
    commit: sha,
    captured: new Date().toISOString().slice(0, 10),
    start, kinds, kinded, vibeRow, vibeStates, palettes, colored, pairingRow, typed, final,
    // The screenshot catches the site's live player on a different frame each run, so the film's
    // fingerprint uses the published site's files instead.
    site: { width: 1920, height: siteH, mode, player, files: hashDir(path.join(sysDir, "public")) },
    brand: { duration: anim.duration / 1000 },
  };
  writeFileSync(path.join(OUT, "capture.json"), JSON.stringify(data, null, 2));
  writeFileSync(path.join(OUT, "data.js"), `window.__CAPTURE = ${JSON.stringify(data)};\n`);
  log(`wrote ${path.relative(ROOT, OUT)}/`);
}

function hashDir(dir: string): string {
  const h = createHash("sha256");
  const walk = (d: string) => {
    for (const f of readdirSync(d).sort()) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(path.relative(dir, p)).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest("hex").slice(0, 16);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
