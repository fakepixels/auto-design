// The README's screenshots, in dark mode, from the current code.
//   npx tsx scripts/readme-shots.mts [out-dir]      (default: docs/)
// Writes onboarding.png (the Kind step, after picking Consumer app) and site.png (the Quiet example's design
// site). 1440 x 900 at 2x, faces served from local packages.
import { createServer } from "node:http";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { runOnboard } from "../packages/cli/src/onboard/server.ts";
import { serveStatic } from "../packages/cli/src/serve.ts";
import { ensureFonts, routeFonts } from "./video/fonts.mts";

const require = createRequire(import.meta.url);
const { ROOT, open } = require("./lib/browser.cjs");
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, "docs"));
const VIEW = { width: 1440, height: 900, scale: 2, scheme: "dark" };

async function onboarding() {
  const scratch = path.join(os.tmpdir(), "auto-design-shots");
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  delete process.env.AUTO_DESIGN_MOCK_MODEL;
  const cwd = process.cwd();
  process.chdir(scratch);
  const { server, port } = await runOnboard({ port: 4730, open: false, dir: path.join(scratch, "moonbeam-design") });
  process.chdir(cwd);
  // The previews on these steps use these faces; fetch any the cache lacks so nothing falls back.
  ensureFonts(["@fontsource-variable/fraunces", "@fontsource-variable/work-sans", "@fontsource-variable/bodoni-moda", "@fontsource-variable/jost", "@fontsource/chakra-petch", "@fontsource/barlow", "@fontsource-variable/fredoka", "@fontsource-variable/nunito", "@fontsource-variable/plus-jakarta-sans", "@fontsource/dm-mono", "@fontsource-variable/azeret-mono"]);
  const { browser, page } = await open(VIEW);
  await routeFonts(page);
  await page.goto(`http://localhost:${port}`, { waitUntil: "networkidle" });
  await page.fill("#p-name", "Moonbeam");
  await page.fill("#p-desc", "A pastel diary for collectors of tiny things");
  await page.click("#next");
  await page.waitForTimeout(1200);
  await page.click('.proofs[data-field="kind"] .proof[data-value="consumer"]');
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1600);
  await page.evaluate(() => document.querySelectorAll("*").forEach((el) => { if (el.scrollTop) el.scrollTop = 0; }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, "onboarding.png") });
  await browser.close();
  server.close();
}

async function site() {
  const dir = path.join(ROOT, "examples", "quiet-design", "public");
  const server = createServer((req, res) => {
    if (!serveStatic(dir, "/", req, res)) res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(4731, "127.0.0.1", () => r()));
  const { browser, page } = await open(VIEW);
  await routeFonts(page);
  for (const [file, url] of [["site.png", "/"]]) {
    await page.goto(`http://localhost:4731${url}`, { waitUntil: "networkidle" });
    // The site follows a class as well as the media query.
    await page.evaluate(() => {
      const r = document.documentElement;
      if (r.dataset.modeClass === "dark") r.classList.add("dark");
      else if (r.dataset.modeClass === "light") r.classList.remove("light");
    });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, file) });
  }
  await browser.close();
  server.close();
}

mkdirSync(OUT, { recursive: true });
await onboarding();
await site();
console.log(`Wrote onboarding.png and site.png to ${path.relative(ROOT, OUT) || "."}`);
process.exit(0);
