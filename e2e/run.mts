// End-to-end tests: the real CLI and the real pages, driven in a real browser.
//   npm run e2e                       everything (about two minutes)
//   npm run e2e -- --only cli,site    some parts: cli, onboarding, site, studio
//   npm run e2e -- --shots out/       keep a screenshot of every step
// Needs Playwright's browser (`npx playwright install chromium`). Everything is written to a temp folder.
// The onboarding run never creates a GitHub repo: it unticks the option and refuses any publish that asks for one.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { chromium, type Browser, type Page } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "node_modules/.bin/auto-design");
const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const only = flag("--only")?.split(",");
const SHOTS = flag("--shots") ? resolve(flag("--shots")!) : null;
const TMP = mkdtempSync(join(tmpdir(), "auto-design-e2e-"));
const PRESETS = ["quiet", "editorial", "glass", "terminal", "tactile"];
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

/** A product that already has a look of its own: warm paper, light serif headlines, large text and tall buttons. */
const PAPER_SITE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Paper</title>
<link href="https://fonts.googleapis.com/css2?family=Newsreader&family=Outfit:wght@400;500&display=swap" rel="stylesheet">
<style>
:root { --paper: #efe6d3; --moss: #3f5a36; }
body { margin: 0; background: var(--paper); color: #2b2a26; font-family: "Outfit", sans-serif; font-size: 19px; }
main { max-width: 720px; margin: 0 auto; padding: 64px 24px; }
h1 { font-family: "Newsreader", serif; font-weight: 400; letter-spacing: 0; font-size: 56px; margin: 0 0 16px; }
.cta { background: var(--moss); color: #fff; border: 0; border-radius: 10px; font: 500 18px "Outfit", sans-serif; min-height: 52px; padding: 0 28px; }
</style></head><body><main><h1>Medicare for the long haul</h1>
<p>Turning 65 comes with a stack of mail and a short window to choose. We read the fine print with you.</p>
<button class="cta">Compare my plans</button></main></body></html>`;

async function paperSite(): Promise<{ url: string; close: () => void }> {
  const server = createServer((_req, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAPER_SITE));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/`, close: () => server.close() };
}

const failures: string[] = [];
let checks = 0;
let area = "";
function ok(pass: unknown, what: string) {
  checks++;
  if (!pass) {
    failures.push(`[${area}] ${what}`);
    console.log(`  ✗ ${what}`);
  }
}
const section = (name: string) => { area = name; console.log(`\n${name}`); };

/* ---------- Running the CLI ---------- */
// Model keys in the environment are never used: these runs only ever talk to the mock model.
const ENV = { ...process.env, ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", OPENROUTER_API_KEY: "", NO_COLOR: "1" };
function ad(cwd: string, argv: string[], input?: string) {
  const r = spawnSync(BIN, argv, { cwd, env: ENV, encoding: "utf8", input: input ?? "", timeout: 180_000 });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}
const servers: ChildProcess[] = [];
async function serve(cwd: string, argv: string[], port: number, env: Record<string, string> = {}): Promise<string> {
  const child = spawn(BIN, [...argv, "--port", String(port)], { cwd, env: { ...ENV, ...env }, stdio: "ignore" });
  servers.push(child);
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return url; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`${argv[0]} didn't start on port ${port}`);
}

/* ---------- Watching a page ---------- */
/** Record console errors, exceptions and failed requests. `expected` lists URL fragments allowed to fail. */
function watch(page: Page, where: () => string, expected: string[] = []) {
  const allowed = (text: string) => expected.some((e) => text.includes(e));
  let quiet = 0;
  page.on("console", (m) => { if (m.type() === "error" && !quiet && !allowed(m.location().url)) ok(false, `${where()}: console error: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => ok(false, `${where()}: page error: ${String(e).slice(0, 200)}`));
  page.on("response", (r) => { if (r.status() >= 400 && !quiet && !allowed(r.url())) ok(false, `${where()}: HTTP ${r.status()} ${r.url()}`); });
  return { quietly: async <T>(fn: () => Promise<T>) => { quiet++; try { return await fn(); } finally { await page.waitForTimeout(100); quiet--; } } };
}
/** How far the page scrolls sideways, and the elements that stick out. */
const sideways = (page: Page) =>
  page.evaluate(() => {
    const over = document.documentElement.scrollWidth - innerWidth;
    if (over <= 1) return "";
    const wide = new Set<string>();
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect();
      if (!b.width || b.right <= innerWidth + 1) continue;
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) { if (getComputedStyle(p).overflowX !== "visible") { clipped = true; break; } p = p.parentElement; }
      if (!clipped) wide.add(el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.split(" ").slice(0, 2).join(".") : ""));
    }
    return `${over}px (${[...wide].slice(0, 4).join(", ")})`;
  });
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

/* ---------- The CLI ---------- */
async function cli() {
  section("CLI");
  ok(PRESETS.every((p) => ad(TMP, ["presets"]).out.includes(p)), "presets lists all five");
  for (const p of PRESETS) {
    const made = ad(TMP, ["init", "--preset", p]);
    const dir = join(TMP, `${p}-design`);
    ok(made.code === 0 && existsSync(join(dir, "public/index.html")), `init --preset ${p} writes the system and its site`);
    ok(ad(dir, ["build"]).code === 0, `${p}: build runs again`);
    const checked = ad(dir, ["check"]);
    ok(checked.code === 0, `${p}: check passes in a new system repo (${checked.out.trim().split("\n").at(-1)})`);
  }
  const sys = join(TMP, "quiet-design");
  ok(ad(TMP, ["init", "--preset", "nope"]).code === 1, "init refuses an unknown preset");
  ok(ad(TMP, ["init", "--preset", "quiet"]).code === 1, "init refuses a folder that already has a system");
  ok(ad(TMP, ["frobnicate"]).code === 1, "an unknown command fails");
  ok(ad(sys, ["message", "Your report is ready"]).code === 0, "message passes a plain text");
  ok(ad(sys, ["message", "HEY!!! FREE prize http://bit.ly/x"]).code === 1, "message fails a shouting text with a link shortener");
  const empty = ad(sys, ["message"]);
  ok(empty.code === 1 && /Pass the text/.test(empty.out), "message refuses an empty text");
  ok(ad(sys, ["message", "-"], "Your report is ready").code === 0, "message reads piped text");
  ok(ad(sys, ["card", "--title", "Approvals in one click", "--out", join(TMP, "card.svg")]).code === 0 && readFileSync(join(TMP, "card.svg"), "utf8").startsWith("<svg"), "card writes an SVG");
  ok(ad(sys, ["card", "--title", "Approvals in one click", "--size", "og", "--out", join(TMP, "card.png")]).code === 0 && existsSync(join(TMP, "card.png")), "card writes a PNG");
  ok(ad(sys, ["animate"]).out.includes("launch"), "animate lists the animations");
  ok(ad(sys, ["animate", "announcement", "--title", "Hello", "--out", join(TMP, "a.html")]).code === 0 && existsSync(join(TMP, "a.html")), "animate writes an HTML animation");
  ok(ad(sys, ["animate", "metric", "--out", join(TMP, "metric.png")]).code === 0 && existsSync(join(TMP, "metric.png")), "animate writes a PNG frame");
  ok(ad(sys, ["animate", "nope", "--out", join(TMP, "b.html")]).code === 1, "animate refuses an unknown animation");

  // A broken config fails the build with the reason.
  const broken = join(TMP, "broken");
  cpSync(sys, broken, { recursive: true });
  writeFileSync(join(broken, "design.config.ts"), readFileSync(join(broken, "design.config.ts"), "utf8").replace(/brand: "[^"]*"/, 'brand: "notacolor"'));
  const built = ad(broken, ["build"]);
  ok(built.code === 1 && /Not a valid CSS color/.test(built.out), "build fails on a bad brand color and says why");

  // Install the system into the example app, then check the app.
  const app = join(TMP, "app");
  cpSync(join(ROOT, "examples/next-quiet"), app, { recursive: true, filter: (src) => !/node_modules|\.next/.test(src) });
  ok(ad(app, ["add", sys, "--components", "all", "--no-install", "--no-mcp"]).code === 0, "add installs every component into an app");
  const appCheck = ad(app, ["check"]);
  ok(appCheck.code === 0, `the app passes check after add (${appCheck.out.trim().split("\n").at(-1)})`);
  writeFileSync(join(app, "app/off.tsx"), 'export const Off = () => <div className="bg-red-500 p-[13px]">x</div>;\n');
  const off = ad(app, ["check", "--json"]);
  ok(off.code === 1 && /no-palette-color/.test(off.out) && /no-arbitrary-value/.test(off.out), "check fails off-system classes in an app");
  rmSync(join(app, "app/off.tsx"));

  // The MCP server over stdio.
  const requests = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "check_code", arguments: { code: 'export const A = () => <div className="bg-red-500">x</div>', filename: "a.tsx" } } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_component", arguments: { name: "button" } } },
  ];
  const mcp = ad(app, ["mcp"], requests.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const answers = mcp.out.trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } });
  ok(answers.length === requests.length && answers.every(Boolean), "the MCP server answers every request with JSON");
  ok(answers[1]?.result?.tools?.length >= 9, "the MCP server lists its tools");
  ok(/no-palette-color/.test(JSON.stringify(answers[2]?.result ?? "")), "check_code reports an off-system class");
  ok(/buttonVariants/.test(JSON.stringify(answers[3]?.result ?? "")), "get_component returns the button's source");
}

/* ---------- Onboarding ---------- */
async function onboarding(browser: Browser, size: keyof typeof SIZES, port: number): Promise<string | null> {
  section(`Onboarding, ${size}`);
  const cwd = join(TMP, `onboard-${size}`);
  mkdirSync(cwd, { recursive: true });
  const base = await serve(cwd, ["init", "--no-open"], port, { AUTO_DESIGN_FORCE_UI: "1", AUTO_DESIGN_MOCK_MODEL: "1" });
  const ctx = await browser.newContext({ viewport: SIZES[size] });
  const page = await ctx.newPage();
  let step = "load";
  const { quietly } = watch(page, () => step);
  await page.route("**/api/publish", (route) => {
    if (route.request().postDataJSON().github === "none") return route.continue();
    ok(false, "publish asked for a GitHub repo; blocked");
    return route.abort();
  });
  const settle = async () => {
    await page.waitForFunction(() => !document.querySelector(".proofs.loading"), null, { timeout: 20_000 }).catch(() => ok(false, `${step}: options never finished loading`));
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(250);
  };
  const at = async (id: string, title: string) => {
    step = id;
    await settle();
    ok((await page.textContent(".step-head h1"))?.trim() === title, `${id}: the step opens ("${title}")`);
  };
  const leave = async () => {
    await settle();
    const over = await sideways(page);
    ok(!over, `${step}: no sideways scroll${over ? `, but it scrolls ${over}` : ""}`);
    const errors = (await page.locator("main .error:visible, main .err:visible").allInnerTexts()).filter((t) => t.trim());
    ok(!errors.length, `${step}: no error on screen${errors.length ? ` (${errors.join(" / ").slice(0, 160)})` : ""}`);
    await shot(page, `onboarding-${size}-${step}`);
    await page.click("#next");
  };
  /** Click every option in a grid, check each one takes, and end on `final`. */
  const pickEach = async (sel: string, final: number, max = 9) => {
    const count = Math.min(await page.locator(sel).count(), max);
    ok(count > 1, `${step}: has options (${count})`);
    for (const i of [...Array(count).keys(), final]) {
      await page.locator(sel).nth(i).click();
      await page.waitForTimeout(200);
      ok((await page.locator(sel).nth(i).getAttribute("aria-pressed")) === "true", `${step}: option ${i + 1} stays selected (${await page.textContent("#status")})`);
    }
  };

  await page.goto(base, { waitUntil: "networkidle" });
  await at("product", "What are you building?");
  await page.click("#next");
  await page.waitForTimeout(200);
  ok(await page.locator("#status").isVisible() && /name/i.test((await page.textContent("#status")) ?? ""), "product: a missing name says so, where it can be seen");
  ok((await page.textContent(".step-head h1"))?.trim() === "What are you building?", "product: doesn't move on without a name");
  await page.fill("#p-name", "Moonbeam");
  await page.fill("#p-desc", "A bedtime story app that reads to kids in a parent's voice");
  await leave();

  await at("kind", "What kind of product is it?");
  await pickEach("[data-field=kind] .proof[data-value]", 0);
  await page.locator('[data-field=kind] .proof[data-value="consumer"]').click();
  await settle();
  await pickEach("[data-field=vibe] .proof[data-value]", 1);
  await leave();

  await at("model", "Connect a model");
  await page.locator("#providers .choice", { hasText: /mock/i }).click();
  await page.click("#connect");
  await page.waitForSelector("#disconnect", { timeout: 10_000 }).catch(() => ok(false, "model: the mock model didn't connect"));
  await leave();

  await at("start", "Pick a starting point");
  await page.fill("#site", "not a site");
  await quietly(async () => { await page.click("#read-site"); await page.waitForFunction(() => document.querySelector("#site-out")?.textContent?.trim(), null, { timeout: 10_000 }).catch(() => {}); });
  ok(/web address/.test((await page.textContent("#site-out")) ?? ""), "start: a bad address says what to type instead");
  // A product that already has a look keeps it: the page color, each face in its job, the sizes and the buttons.
  const paper = await paperSite();
  await page.fill("#site", paper.url);
  await page.click("#read-site");
  await page.waitForSelector("#site-out .found", { timeout: 30_000 }).catch(() => ok(false, "start: reading a site didn't finish"));
  const found = ((await page.textContent("#site-out")) ?? "").replace(/\s+/g, " ");
  ok(/#efe6d3\s*kept as your page color/.test(found), `start: says it keeps the site's page color (${found.slice(0, 120)})`);
  ok(/Newsreader\s*headlines, weight 400, 56px/.test(found) && /Outfit\s*text, 19px/.test(found), "start: says which face sets headlines and which sets text, with their sizes");
  ok(/52px buttons/.test(found), "start: says how tall the site's buttons are");
  const asItIs = page.locator('#made-grid .proof[data-value="gen:site"]');
  ok(/Your site, as it is/.test((await asItIs.textContent().catch(() => "")) ?? ""), "start: offers the site as it is");
  await asItIs.click().catch(() => {});
  await settle();
  const kept = (await page.evaluate(() => fetch("/api/state").then((r) => r.json()))).choices ?? {};
  ok(kept.page === "#efe6d3" && kept.baseSize === 19 && kept.headingWeight === 400 && kept.tracking === "normal" && kept.density === "spacious" && kept.radius === 10,
    `start: the site as it is keeps its page, text size, headline weight, buttons and corners (${JSON.stringify(kept).slice(0, 300)})`);
  ok(kept.fonts?.display === "newsreader" && kept.fonts?.sans === "outfit", "start: the serif stays on headlines and the sans on text");
  const drawn = await asItIs.locator(".sp").first().evaluate((el) => getComputedStyle(el).getPropertyValue("--background")).catch(() => "");
  ok(drawn.trim() && !/oklch\(1 0 0\)/.test(drawn), `start: its preview is drawn on the site's own page color (${drawn.trim()})`);
  paper.close();
  await page.fill("#site", "");
  ok((await page.locator("#made-grid .proof[data-value]").count()) >= 1, "start: offers a starting point made from the kind");
  await pickEach("#start-grid .proof[data-value]", 0);
  await page.evaluate(() => { const out = document.querySelector("#site-out"); if (out) out.innerHTML = ""; });
  await leave();

  await at("feel", "Set the feel");
  for (const k of ["energy", "warmth", "novelty"]) {
    await page.locator(`input[data-k=${k}]`).focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
  }
  await leave();

  await at("texture", "Choose a texture");
  await pickEach("[data-field=texture] .proof[data-value]", 2);
  await leave();

  await at("type", "Choose type");
  await pickEach(".proofs .proof[data-value]", 1, 4);
  await leave();

  await at("color", "Choose a brand color");
  ok((await page.locator(".pal").count()) > 5, "color: shows ready palettes");
  await page.locator(".pal").nth(1).click();
  await page.waitForTimeout(400);
  await leave();

  await at("shape", "Choose corners and density");
  await pickEach("[data-field=radius] .proof[data-value]", 3);
  await pickEach("[data-field=density] .proof[data-value]", 1);
  await leave();

  await at("motion", "Choose motion");
  await pickEach("[data-field=motion] .proof[data-value]", 1);
  await leave();

  await at("surfaces", "Where will it live?");
  const surfaces = page.locator(".proofs .proof[role=checkbox]");
  for (let i = 0; i < (await surfaces.count()); i++) {
    if ((await surfaces.nth(i).getAttribute("aria-pressed")) !== "true") { await surfaces.nth(i).click(); await page.waitForTimeout(200); }
  }
  ok((await page.locator('.proofs .proof[role=checkbox][aria-pressed="true"]').count()) === 6, "surfaces: all six can be on");
  await leave();

  await at("review", "Review everything");
  ok(!/No change/.test(await page.locator("#hist").innerText()), "review: every change in the history says what changed");
  await page.locator("#quick .chip").first().click();
  await page.waitForTimeout(800);
  await page.fill("#ask", "Warmer and rounder");
  await page.click("#ask-go");
  await page.waitForFunction(() => /Asked: Warmer and rounder/.test(document.querySelector("#hist")?.textContent ?? ""), null, { timeout: 15_000 }).catch(() => {});
  ok(/Asked: Warmer and rounder/.test(await page.locator("#hist").innerText()), "review: a request in words lands in the history");
  await page.click("#undo");
  await page.waitForTimeout(500);
  ok(/Undid/.test((await page.textContent("#status")) ?? ""), "review: Undo takes the last change back");
  for (const mode of ["light", "dark"]) { await page.click(`#r-mode [data-v=${mode}]`); await page.waitForTimeout(250); await shot(page, `onboarding-${size}-review-${mode}`); }
  await page.evaluate(() => { const s = document.querySelector("#status"); if (s) s.textContent = ""; });
  await leave();

  await at("publish", "Create your design system");
  await page.waitForFunction(() => !/Checking for git/.test(document.querySelector("#gh-area")?.textContent ?? ""), null, { timeout: 15_000 }).catch(() => ok(false, "publish: the GitHub check never finished"));
  await shot(page, `onboarding-${size}-publish`);
  if (size !== "desktop") { await ctx.close(); return null; }

  // Publish to a local folder only.
  if (await page.locator("#use-gh").count()) await page.uncheck("#use-gh");
  if (await page.locator("#skip-gh").count()) await page.check("#skip-gh");
  await page.locator("#hosting .choice", { hasText: "Decide later" }).click();
  const dir = join(cwd, "moonbeam-design");
  await page.fill("#pub-dir", dir);
  await page.click("#next");
  step = "done";
  await page.waitForFunction(() => /is ready/.test(document.querySelector(".step-head h1")?.textContent ?? "") || document.querySelector("#status.err"), null, { timeout: 120_000 }).catch(() => {});
  ok(/Moonbeam is ready/.test((await page.textContent(".step-head h1")) ?? ""), `publishing finishes (${await page.textContent("#status")})`);
  ok((await page.locator(".steps-out > div.bad").count()) === 0 && (await page.locator(".steps-out > div").count()) >= 3, "every publish step succeeds");
  ok(await page.locator("#undo").isHidden(), "Undo is gone once the system is written");
  ok(existsSync(join(dir, "design.config.ts")) && existsSync(join(dir, "public/index.html")) && existsSync(join(dir, ".git")), "the repo is on disk, with its site, committed");
  ok(!existsSync(join(dir, ".git/refs/remotes")), "nothing was pushed anywhere");
  await shot(page, "onboarding-done");
  ok((await page.request.get(`${base}/site/`)).ok(), "onboarding serves the new design site");

  step = "studio";
  await page.click("#open-studio");
  await page.waitForURL(/localhost:\d+\/$/, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(800);
  ok((await page.title()) === "auto-design studio", "Open the studio lands in the studio");
  await studio(page, dir, quietly);
  await ctx.close();
  return dir;
}

/* ---------- The studio ---------- */
async function studio(page: Page, dir: string, quietly: <T>(fn: () => Promise<T>) => Promise<T>) {
  const status = async () => ((await page.textContent("#status")) ?? "").trim();
  const config = () => readFileSync(join(dir, "design.config.ts"), "utf8");
  const before = config();
  ok((await status()) === "All changes saved" && (await page.isDisabled("#save")), "studio: opens with nothing to save");
  await page.fill("#code", "not-a-color");
  // A code that can't be parsed is answered with a 422 and a message under the field.
  await quietly(async () => { await page.press("#code", "Enter"); await page.waitForTimeout(300); });
  ok((await page.getAttribute("#code", "aria-invalid")) === "true" && (await page.locator("#code-error").isVisible()), "studio: a bad color code is marked and explained");
  await page.fill("#code", "#e11d48");
  await page.press("#code", "Enter");
  await page.waitForTimeout(700);
  ok((await status()) === "Unsaved changes" && !(await page.isDisabled("#save")), "studio: a new color can be saved");
  await page.locator("#radius").focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.click("#revert");
  await page.waitForTimeout(500);
  ok((await status()) === "All changes saved" && config() === before, "studio: Revert puts everything back and touches nothing on disk");
  await page.fill("#code", "#0f766e");
  await page.press("#code", "Enter");
  await page.waitForTimeout(500);
  await page.click("#save");
  await page.waitForFunction(() => /Saved/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 30_000 }).catch(() => {});
  ok(/brand: "#0f766e"/.test(config()), "studio: Save writes the color to design.config.ts");
  ok(/Saved design.config.ts and rebuilt/.test((await page.textContent("#synced")) ?? ""), "studio: Save rebuilds the system");
  const over = await sideways(page);
  ok(!over, `studio: no sideways scroll${over ? `, but it scrolls ${over}` : ""}`);
  await shot(page, "studio");
}

/* ---------- The design site ---------- */
async function site(browser: Browser, dir: string, name: string, port: number) {
  section(`Design site, ${name}`);
  const base = await serve(dir, ["serve"], port);
  const pages: string[] = [];
  for (const size of ["desktop", "phone"] as const) {
    const ctx = await browser.newContext({ viewport: SIZES[size] });
    const page = await ctx.newPage();
    let where = "";
    watch(page, () => where);
    const queue = size === "desktop" ? [`${base}/`] : pages;
    const seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const url = queue[i]!;
      if (seen.has(url)) continue;
      seen.add(url);
      where = `${size} ${url.replace(base, "")}`;
      const res = await page.goto(url, { waitUntil: "load" });
      if (!(res?.headers()["content-type"] ?? "").includes("html")) continue;
      if (size === "desktop") pages.push(url);
      const r = await page.evaluate(() => ({
        links: [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => a.href),
        dead: [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute("href")!).filter((h) => h.length > 1 && !document.getElementById(decodeURIComponent(h.slice(1)))),
        images: [...document.images].filter((i) => i.complete && !i.naturalWidth).map((i) => i.src),
        h1: document.querySelectorAll("h1").length,
        title: document.title,
        thin: (document.querySelector("main")?.innerText ?? "").trim().length < 40,
      }));
      const over = await sideways(page);
      ok(!over, `${where}: no sideways scroll${over ? `, but it scrolls ${over}` : ""}`);
      ok(!r.dead.length, `${where}: in-page links have targets${r.dead.length ? ` (missing ${r.dead.join(", ")})` : ""}`);
      ok(!r.images.length, `${where}: images load`);
      ok(r.h1 === 1, `${where}: has one h1 (found ${r.h1})`);
      ok(r.title && !r.thin, `${where}: has a title and content`);
      if (size === "desktop") for (const l of r.links) { const u = new URL(l); u.hash = ""; if (u.origin === base && !seen.has(u.href) && !queue.includes(u.href)) queue.push(u.href); }
    }
    // The color mode switch, and that the choice survives a reload.
    where = `${size} mode switch`;
    await page.goto(`${base}/`, { waitUntil: "load" });
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const first = await bg();
    await page.locator('button[aria-label="Switch color mode"]').first().click();
    await page.waitForTimeout(400);
    const second = await bg();
    ok(first !== second, "the mode switch changes the page");
    await page.reload({ waitUntil: "load" });
    ok((await bg()) === second, "the chosen mode survives a reload");
    if (size === "desktop") {
      where = "search";
      await page.keyboard.press("ControlOrMeta+k");
      await page.locator("[data-palette-input]").fill("button");
      await page.waitForTimeout(300);
      ok(/Button/.test(await page.locator("[data-palette-list]").innerText()), "search finds the button component");
      await page.keyboard.press("Escape");
    }
    await shot(page, `site-${name}-${size}`);
    await ctx.close();
  }
  ok(pages.length >= 40, `${name}: the crawl reached every page (${pages.length})`);
}

/* ---------- Run ---------- */
const run = (part: string) => !only || only.includes(part);
let browser: Browser | null = null;
try {
  browser = await chromium.launch({ executablePath: process.env.AUTO_DESIGN_CHROMIUM || undefined });
  if (run("cli")) await cli();
  let published: string | null = null;
  if (run("onboarding") || run("studio")) {
    published = await onboarding(browser, "desktop", 4610);
    if (run("onboarding")) await onboarding(browser, "phone", 4620);
  }
  if (run("site")) {
    if (published) await site(browser, published, "from onboarding", 4630);
    if (!existsSync(join(TMP, "terminal-design"))) for (const p of ["quiet", "terminal"]) ad(TMP, ["init", "--preset", p]);
    await site(browser, join(TMP, "quiet-design"), "quiet", 4631);
    await site(browser, join(TMP, "terminal-design"), "terminal", 4632);
  }
} catch (err) {
  failures.push(`[${area}] stopped: ${(err as Error).message}`);
  console.log(`  ✗ stopped: ${(err as Error).stack ?? err}`);
} finally {
  await browser?.close();
  for (const s of servers) s.kill();
  rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${failures.length ? "✗" : "✓"} ${checks} checks, ${failures.length} failed${SHOTS ? `. Screenshots in ${SHOTS}` : ""}`);
for (const f of failures) console.log(`  ${f}`);
process.exit(failures.length ? 1 : 0);
