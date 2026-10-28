// The README's product film, from the current code.
//   npm run video                 capture, check, render, encode, update the README
//   npm run video -- --force      render even when nothing the film shows has changed
//   npm run video -- --no-capture reuse video/assets/capture/ from the last run
//
// Capture (scripts/video/capture.mts) runs the real onboarding and publishes the Moonbeam system; the
// HyperFrames project in video/ draws the film from it. When the capture and the film's files are the
// same as last time, nothing is re-rendered, so the repo only grows when the product's look changes.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT, check, duration, encodeForReadme, fingerprint, hf, longDate, mb, writeBlock } from "./hf.mts";

const args = new Set(process.argv.slice(2));
const PROJECT = path.join(ROOT, "video");
const CAPTURE = path.join(PROJECT, "assets", "capture");
const MEDIA = path.join(ROOT, "docs", "media");
const STAMP = path.join(MEDIA, "product-film.json");

function main() {
  if (!args.has("--no-capture")) {
    console.log("Capturing the product…");
    const r = spawnSync("npx", ["tsx", path.join(ROOT, "scripts", "video", "capture.mts")], { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) throw new Error("Capture failed.");
  }
  if (!existsSync(path.join(CAPTURE, "capture.json"))) throw new Error("No capture yet: run without --no-capture.");

  const cap = JSON.parse(readFileSync(path.join(CAPTURE, "capture.json"), "utf8"));
  const { commit, captured, ...shown } = cap;
  const sources = [
    path.join(PROJECT, "index.html"),
    ...["compositions", "lib"].flatMap((d) => readdirSync(path.join(PROJECT, d)).sort().map((f) => path.join(PROJECT, d, f))),
    // Not site.png: its live player lands on a different frame each run. capture.json has the site's hash.
    path.join(CAPTURE, "brand.mp4"),
    // The film draws every card with the product's renderer, so a change to how it draws is a change to the film.
    path.join(CAPTURE, "renderer.css"),
    path.join(CAPTURE, "renderer.js"),
  ];
  const print = fingerprint([JSON.stringify(shown), ...sources.map((file) => ({ file }))]);
  const last = existsSync(STAMP) ? JSON.parse(readFileSync(STAMP, "utf8")) : null;
  if (!args.has("--force") && last?.fingerprint === print && existsSync(path.join(MEDIA, "product-film.mp4"))) {
    console.log("The film is current: nothing it shows has changed since " + last.commit + ". Pass --force to render anyway.");
    return;
  }

  console.log("Checking the film…");
  check(PROJECT);
  console.log("Rendering (a few minutes)…");
  mkdirSync(path.join(PROJECT, "renders"), { recursive: true });
  const master = path.join(PROJECT, "renders", "product-film.mp4");
  if (!hf(PROJECT, ["render", "--quality", "delivery", "--output", master]).ok) throw new Error("Render failed.");
  const secs = duration(master);
  if (!(secs > 30)) throw new Error(`The render is ${secs}s long; expected about 34s.`);

  mkdirSync(MEDIA, { recursive: true });
  const mp4 = path.join(MEDIA, "product-film.mp4"), webp = path.join(MEDIA, "product-film.webp");
  encodeForReadme(master, mp4, webp, { width: 960, fps: 15, quality: 60 });
  writeFileSync(STAMP, JSON.stringify({ fingerprint: print, commit, captured, seconds: Math.round(secs) }, null, 2) + "\n");
  console.log(`  docs/media/product-film.mp4 ${mb(mp4)}, product-film.webp ${mb(webp)}`);

  writeBlock("product-film", `
<a href="docs/media/product-film.mp4"><img src="docs/media/product-film.webp" width="100%" alt="auto-design in ${Math.round(secs)} seconds: a gray card becomes Moonbeam's invitation as you pick a kind, a vibe, a color, type and motion, then splits into the whole system: its app, site, chat and messages, its design site and its own launch animation."></a>

<sub>Recorded from the real onboarding on ${longDate(captured)} (${commit}). It re-renders when the product's look changes: <code>npm run video</code>. <a href="docs/media/product-film.mp4">Watch the full-size film</a>.</sub>
`);
  console.log("Updated the README.");
}

try {
  main();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
