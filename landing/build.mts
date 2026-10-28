// Builds auto-design's landing page into landing/dist/: one static HTML page, its CSS compiled by Tailwind
// against auto-design's own design system (brand/, installed with `auto-design add`), self-hosted fonts and
// the product film. Host dist/ anywhere static.
//   npx tsx landing/build.mts
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compile, optimize } from "@tailwindcss/node";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SRC = path.join(HERE, "src");
const OUT = path.join(HERE, "dist");
const CACHE = path.join(HERE, ".cache");

/** The system's fonts, served from here rather than Google: the Latin subset of each variable face. */
const FONTS = ["@fontsource-variable/inter", "@fontsource-variable/jetbrains-mono"];

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(path.join(OUT, "fonts"), { recursive: true });
  mkdirSync(path.join(OUT, "media"), { recursive: true });
  mkdirSync(CACHE, { recursive: true });

  // 1. The markup: the page in TSX, prerendered.
  const entry = path.join(CACHE, "render.mjs");
  await build({
    entryPoints: [path.join(SRC, "render.tsx")],
    outfile: entry,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
    tsconfig: path.join(HERE, "tsconfig.json"),
    logLevel: "warning",
  });
  const { render, TITLE, DESCRIPTION } = await import(`${pathToFileURL(entry).href}?t=${Date.now()}`);
  const body: string = await render();

  // 2. The CSS: the app's entry (Tailwind plus the system's locked theme), built for the classes in use.
  //    Only on-system classes exist, so anything off-system in the page simply produces nothing.
  const sources = [body, ...files(SRC).filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => readFileSync(f, "utf8"))];
  const compiler = await compile(readFileSync(path.join(SRC, "app.css"), "utf8"), { base: SRC, onDependency() {} });
  let css = compiler.build(candidates(sources));
  try {
    css = optimize(css, { minify: true }).code;
  } catch {
    // Unminified is fine.
  }
  writeFileSync(path.join(OUT, "app.css"), fontFaces() + css);

  // 3. Assets: the film from the README, and this page's own files.
  copyFileSync(path.join(ROOT, "docs", "media", "product-film.mp4"), path.join(OUT, "media", "product-film.mp4"));
  cpSync(path.join(HERE, "public"), OUT, { recursive: true });
  const og = existsSync(path.join(OUT, "og.png"));

  writeFileSync(path.join(OUT, "index.html"), document({ title: TITLE, description: DESCRIPTION, body, og }));
  const size = files(OUT).reduce((n, f) => n + statSync(f).size, 0);
  console.log(`  wrote ${path.relative(process.cwd(), OUT)}/ (${(size / 1e6).toFixed(1)} MB)`);
}

function document(o: { title: string; description: string; body: string; og: boolean }): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  // Crawlers want an absolute image URL: set LANDING_URL to where the page is hosted.
  const base = (process.env.LANDING_URL ?? "").replace(/\/?$/, "/").replace(/^\/$/, "");
  const og = o.og ? `\n<meta property="og:image" content="${base}og.png">\n<meta name="twitter:card" content="summary_large_image">` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">${og}
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preload" href="fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<script>
  // The system loads dark; light follows the reader's own setting.
  try { const m = matchMedia("(prefers-color-scheme: light)"); const set = () => document.documentElement.classList.toggle("light", m.matches); set(); m.addEventListener("change", set); } catch {}
</script>
<link rel="stylesheet" href="app.css">
</head>
<body>
${o.body}
<script>
  for (const b of document.querySelectorAll("[data-copy]")) {
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        b.dataset.copied = "";
        setTimeout(() => delete b.dataset.copied, 1600);
      } catch {
        // No clipboard here: select the commands so a keyboard copy works.
        const pre = b.closest("[data-slot=terminal]")?.querySelector("pre");
        if (pre) getSelection()?.selectAllChildren(pre);
      }
    });
  }
  // The film loops on its own, unless the reader asked for less motion.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) for (const v of document.querySelectorAll("video")) { v.pause(); v.controls = true; }
</script>
</body>
</html>
`;
}

/** @font-face rules for each font's Latin subset, with the files copied next to the CSS. */
function fontFaces(): string {
  let out = "";
  for (const pkg of FONTS) {
    const dir = path.dirname(require.resolve(`${pkg}/package.json`, { paths: [HERE, ROOT] }));
    const index = readFileSync(path.join(dir, "index.css"), "utf8");
    const block = index.split(/\n(?=\/\* )/).find((b) => /-latin-wght-normal \*\//.test(b));
    if (!block) throw new Error(`No Latin subset in ${pkg}/index.css`);
    const file = /url\(\.\/files\/([^)]+)\)/.exec(block)?.[1];
    if (!file) throw new Error(`No font file in ${pkg}/index.css`);
    copyFileSync(path.join(dir, "files", file), path.join(OUT, "fonts", file));
    out += block.replace(/^\/\*.*\*\/\n/, "").replace(`./files/${file}`, `fonts/${file}`).trim() + "\n";
  }
  return out;
}

/** Class candidates in markup and source, the way Tailwind's scanner reads them. */
function candidates(sources: string[]): string[] {
  const out = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/[^\s"'`<>{}\\]+/g)) {
      const t = m[0].replace(/[,;)]+$/, "");
      if (t.length < 2 || t.length > 160) continue;
      if (/^[a-z@!\[-]/.test(t) || /^[a-z0-9-]+:/.test(t)) out.add(t);
    }
  }
  return [...out];
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
