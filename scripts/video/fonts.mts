// Fonts for the video scripts: Fontsource packages installed once into a cache, served to Chromium in
// place of Google Fonts, and copied into a HyperFrames project as @font-face rules.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./hf.mts";

export const FONT_CACHE = path.join(os.homedir(), ".cache", "auto-design", "film-fonts");
export const FONT_DIRS = [path.join(ROOT, "node_modules"), path.join(FONT_CACHE, "node_modules")];

/** Install any missing font packages into the cache. */
export function ensureFonts(pkgs: string[]): void {
  const missing = pkgs.filter((p) => !pkgDir(p));
  if (!missing.length) return;
  mkdirSync(FONT_CACHE, { recursive: true });
  if (!existsSync(path.join(FONT_CACHE, "package.json"))) writeFileSync(path.join(FONT_CACHE, "package.json"), '{"private":true}\n');
  console.log(`  fetching ${missing.join(", ")}`);
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--silent", ...missing], { cwd: FONT_CACHE, stdio: "inherit" });
  if (r.status !== 0) throw new Error("Couldn't install the film's font packages from npm.");
}

export function pkgDir(pkg: string): string | null {
  return FONT_DIRS.map((d) => path.join(d, pkg)).find((d) => existsSync(path.join(d, "index.css"))) ?? null;
}

/** @font-face rules for one package, latin and latin-ext only, pointing at copies in `outDir/fonts/`. */
export function fontFaces(pkg: string, weights: number[], outDir: string): string {
  const dir = pkgDir(pkg);
  if (!dir) return "";
  mkdirSync(path.join(outDir, "fonts"), { recursive: true });
  const variable = pkg.startsWith("@fontsource-variable/");
  const sheets = variable ? ["index.css"] : [...new Set(weights)].map((w) => `${w}.css`).filter((f) => existsSync(path.join(dir, f)));
  let out = "";
  for (const sheet of sheets) {
    const css = readFileSync(path.join(dir, sheet), "utf8");
    for (const raw of css.split("@font-face").slice(1)) {
      // Each block ends where the next subset's comment starts; keep only latin and latin-ext.
      const block = raw.replace(/\/\*[^]*?\*\/\s*$/, "");
      const files = [...block.matchAll(/url\(\.\/files\/([^)]+)\)/g)].map((m) => m[1]!);
      if (!files.some((f) => /-latin-/.test(f))) continue;
      for (const f of files) {
        const src = path.join(dir, "files", f);
        if (existsSync(src)) copyFileSync(src, path.join(outDir, "fonts", f));
      }
      out += "@font-face" + block.replace(/url\(\.\/files\//g, "url(fonts/").replace(/,?\s*url\(fonts\/[^)]+\.woff\)\s*format\('woff'\)/g, "") + "\n";
    }
  }
  return out;
}

/** Google Fonts CSS answered from local packages. */
function googleCss(url: string): string {
  const names = new URL(url).searchParams.getAll("family").map((f) => f.split(":")[0]!.replace(/\+/g, " "));
  let css = "";
  for (const name of names) {
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    for (const p of [`@fontsource-variable/${slug}`, `@fontsource/${slug}`]) {
      const dir = pkgDir(p);
      if (!dir) continue;
      const rel = path.relative(FONT_DIRS.find((d) => dir.startsWith(d))!, dir);
      const sheets = ["index.css", ...(p.startsWith("@fontsource/") ? ["500.css", "600.css", "700.css"] : [])];
      for (const s of sheets) if (existsSync(path.join(dir, s))) css += readFileSync(path.join(dir, s), "utf8").replace(/url\(\.\/files\//g, `url(https://fonts.local/${rel}/files/`);
      break;
    }
  }
  return css;
}

/** Serve Google Fonts requests from the local packages (the sandbox can't reach Google). */
export async function routeFonts(page: any): Promise<void> {
  await page.unroute("https://fonts.googleapis.com/**").catch(() => {});
  await page.unroute("https://fonts.local/**").catch(() => {});
  await page.route("https://fonts.googleapis.com/**", (route: any) => route.fulfill({ status: 200, contentType: "text/css", body: googleCss(route.request().url()) }));
  await page.route("https://fonts.local/**", (route: any) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    const file = FONT_DIRS.map((d) => path.join(d, rel)).find(existsSync);
    return file ? route.fulfill({ status: 200, contentType: "font/woff2", body: readFileSync(file) }) : route.fulfill({ status: 404, body: "" });
  });
}

/** Every family a specimen uses, merged by package. */
export function addFamilies(into: Map<string, { family: string; pkg: string; weights: number[] }>, sp: any): void {
  for (const f of sp?.fonts?.families ?? []) {
    const had = into.get(f.package);
    into.set(f.package, { family: f.family, pkg: f.package, weights: [...new Set([...(had?.weights ?? []), ...f.weights])] });
  }
}
