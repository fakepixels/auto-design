import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import {
  FORMATS,
  FONT_CATALOG,
  animationDocument,
  animationsFor,
  buildSystem,
  renderAnimation,
  type AnimationFormat,
  type AnimationProps,
  type DesignSystem,
  type SpecimenCopy,
} from "@auto-design/core";
import pc from "picocolors";
import { CONFIG_FILE, loadConfig, loadCopy, siteCopy } from "./commands.js";
import { attachCustom, loadCustom } from "./custom.js";
import { launchBrowser } from "./agents.js";

/**
 * `auto-design animate`: render a brand animation to video. The animation is
 * the same HTML the design site plays; Playwright steps its clock frame by
 * frame and ffmpeg encodes the frames, so every frame is exact and the result
 * matches the site.
 */

export interface AnimateOptions {
  cwd: string;
  id?: string;
  format?: string;
  mode?: string;
  out?: string;
  fps?: number;
  /** Words for the animation's fields, by field key. Lists separate items with |. */
  props?: Record<string, string>;
  json?: boolean;
  quiet?: boolean;
}

export interface AnimateResult {
  id: string;
  out: string | null;
  kind: "video" | "gif" | "html" | "frames" | "list";
  duration: number;
  frames?: number;
  note?: string;
}

function findUp(from: string, file: string): string | null {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, file))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The system to animate: the design system repo around cwd, or the one an
 * app installed from a local folder (auto-design.json's registry).
 */
export async function systemForMotion(cwd: string): Promise<{ s: DesignSystem; copy: SpecimenCopy; root: string }> {
  const repo = findUp(cwd, CONFIG_FILE);
  let root = repo;
  if (!root) {
    const app = findUp(cwd, "auto-design.json");
    if (app) {
      const g = JSON.parse(readFileSync(join(app, "auto-design.json"), "utf8")) as { registry?: string };
      const reg = g.registry && !/^https?:\/\//.test(g.registry) ? (isAbsolute(g.registry) ? g.registry : resolve(app, g.registry)) : null;
      // A local registry is the system repo itself or its public/r/ folder.
      const candidates = reg ? [reg, resolve(reg, ".."), resolve(reg, "../..")] : [];
      root = candidates.find((c) => existsSync(join(c, CONFIG_FILE))) ?? null;
    }
  }
  if (!root) throw new Error("Run this in the design system repo (where design.config.ts is), or in an app that installed the system from a local folder.");
  const s = attachCustom(buildSystem(await loadConfig(root)), loadCustom(root));
  return { s, copy: siteCopy(s, loadCopy(root)), root };
}

/** Props from command-line flags: only keys the animation has. */
export function propsFor(s: DesignSystem, id: string, flags: Record<string, unknown>): AnimationProps {
  const info = animationsFor(s).find((a) => a.id === id);
  if (!info) throw new Error(`Unknown animation "${id}". Run \`npx auto-design animate\` to list them.`);
  const props: AnimationProps = {};
  for (const f of info.fields) {
    const v = flags[f.key];
    if (v === undefined || v === null || v === true) continue;
    props[f.key] = f.kind === "list" ? String(v).split("|").map((x) => x.trim()).filter(Boolean) : String(v);
  }
  return props;
}

function ffmpegPath(): string | null {
  const env = process.env.AUTO_DESIGN_FFMPEG;
  if (env && existsSync(env)) return env;
  const r = spawnSync(process.platform === "win32" ? "where" : "which", ["ffmpeg"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0]!.trim() || null : null;
}

/** Serve the system's fonts from local npm packages when they're installed, so renders work offline. */
function localFontCss(root: string, families: string[]): string | null {
  const req = createRequire(join(root, "package.json"));
  let css = "";
  for (const fam of families) {
    const entry = FONT_CATALOG.find((f) => f.google === fam);
    if (!entry) continue;
    try {
      const file = req.resolve(`${entry.package}/index.css`);
      const dir = dirname(file);
      css += readFileSync(file, "utf8").replace(/url\(\.\/files\//g, `url(https://fonts.local${encodeURI(dir)}/files/`);
    } catch {
      return null;
    }
  }
  return css || null;
}

const ENCODE: Record<string, (fps: number, width: number) => string[]> = {
  ".mp4": () => ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "medium", "-movflags", "+faststart"],
  ".mov": () => ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17"],
  ".webm": () => ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "28", "-pix_fmt", "yuv420p", "-row-mt", "1"],
  ".gif": (fps, width) => ["-vf", `fps=${Math.min(fps, 24)},scale=${Math.min(width, 960)}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a`, "-loop", "0"],
};

export async function runAnimate(opts: AnimateOptions): Promise<AnimateResult> {
  const { s, copy, root } = await systemForMotion(opts.cwd);
  const list = animationsFor(s);

  if (!opts.id) {
    if (opts.json) console.log(JSON.stringify(list, null, 2));
    else {
      console.log(`${pc.bold(`${s.config.displayName} animations`)}\n`);
      for (const a of list) {
        const r = renderAnimation(s, a.id, { copy });
        console.log(`  ${pc.cyan(a.id.padEnd(15))} ${(a.loop ? "loop" : `${(r.duration / 1000).toFixed(1)}s`).padEnd(6)} ${a.description}`);
      }
      console.log(`\nRender one: ${pc.cyan("npx auto-design animate announcement --title \"Your headline\" --out launch.mp4")}`);
    }
    return { id: "", out: null, kind: "list", duration: 0 };
  }

  const id = opts.id;
  const info = list.find((a) => a.id === id);
  if (!info) throw new Error(`Unknown animation "${id}". Available: ${list.map((a) => a.id).join(", ")}.`);
  const format = (opts.format && opts.format in FORMATS ? opts.format : "landscape") as AnimationFormat;
  if (opts.format && !(opts.format in FORMATS)) throw new Error(`Format is landscape, square or portrait.`);
  const mode = opts.mode === "dark" || opts.mode === "light" ? opts.mode : undefined;
  const props = propsFor(s, id, opts.props ?? {});
  const fps = Math.min(60, Math.max(12, Math.round(opts.fps ?? 30)));
  // Like other commands, --out is relative to where you run it.
  const out = resolve(opts.out ?? `${id}.mp4`);
  const ext = opts.out?.endsWith("/") ? "/" : extname(out).toLowerCase();
  const rendered = renderAnimation(s, id, { copy, props, format });
  const say = (m: string) => !opts.quiet && !opts.json && console.log(m);
  mkdirSync(ext === "/" ? out : dirname(out), { recursive: true });

  // A self-contained HTML file needs nothing else.
  const html = (purpose: "play" | "render") => animationDocument(s, id, { copy, props, format, mode, purpose });
  if (ext === ".html") {
    writeFileSync(out, html("play"));
    say(`${pc.green("✓")} Wrote ${relative(process.cwd(), out)}: ${info.title}, ${(rendered.duration / 1000).toFixed(1)}s. It plays in any browser.`);
    return { id, out, kind: "html", duration: rendered.duration };
  }
  if (ext !== "/" && ext !== ".png" && !ENCODE[ext]) throw new Error(`Write .mp4, .webm, .gif, .mov, .html, a .png poster, or a folder ending in / for PNG frames.`);

  const ffmpeg = ext === "/" || ext === ".png" ? null : ffmpegPath();
  if (ext !== "/" && ext !== ".png" && !ffmpeg) {
    const fallback = out.replace(/\.[^.]+$/, ".html");
    writeFileSync(fallback, html("play"));
    const note = `Video needs ffmpeg (macOS: brew install ffmpeg; Linux: apt install ffmpeg). Wrote ${relative(process.cwd(), fallback)} instead; it plays in any browser.`;
    say(`${pc.yellow("~")} ${note}`);
    return { id, out: fallback, kind: "html", duration: rendered.duration, note };
  }

  const size = FORMATS[format];
  // Loops play three times in a video; everything else plays once and holds.
  const length = rendered.loop ? rendered.duration * 3 : rendered.duration;
  const frames = ext === ".png" ? 1 : Math.ceil((length / 1000) * fps) + 1;

  const browser = await launchBrowser();
  try {
    const page = (await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 })) as Awaited<ReturnType<typeof browser.newPage>> & {
      route(url: string, fn: (r: { request(): { url(): string }; fulfill(o: object): Promise<void>; continue(): Promise<void> }) => void): Promise<void>;
      waitForFunction(fn: string, arg?: unknown, o?: object): Promise<unknown>;
    };
    const families = [s.type.fonts.sans, s.type.fonts.mono, s.type.fonts.display].filter(Boolean).map((f) => FONT_CATALOG.find((e) => e.family === f!.family)?.google ?? "");
    const local = localFontCss(root, families.filter(Boolean));
    if (local) {
      await page.route("https://fonts.googleapis.com/**", (r) => void r.fulfill({ status: 200, contentType: "text/css", body: local }));
      await page.route("https://fonts.local/**", (r) => void r.fulfill({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURI(new URL(r.request().url()).pathname)) }));
    }
    const file = join(root, ".auto-design", "render", `${id}.html`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html("render"));
    await page.goto(`file://${file}`, { waitUntil: "load" });
    await page.waitForFunction("window.__ready === true", null, { timeout: 30_000 });

    if (ext === ".png") {
      await page.evaluate(`window.__seek(${rendered.loop ? rendered.duration / 2 : rendered.duration})`);
      writeFileSync(out, await page.screenshot({ type: "png" }));
      say(`${pc.green("✓")} Wrote ${relative(process.cwd(), out)}: the last frame of ${info.title}.`);
      return { id, out, kind: "frames", duration: rendered.duration, frames: 1 };
    }

    let enc: ReturnType<typeof spawn> | null = null;
    let encErr = "";
    if (ffmpeg) {
      enc = spawn(ffmpeg, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", ...ENCODE[ext]!(fps, size.width), out], { stdio: ["pipe", "ignore", "pipe"] });
      enc.stderr!.on("data", (b: Buffer) => (encErr += b.toString()));
    }
    const write = (buf: Buffer) => new Promise<void>((ok, fail) => (enc!.stdin!.write(buf, (e) => (e ? fail(e) : ok()))));
    const started = Date.now();
    for (let i = 0; i < frames; i++) {
      const t = Math.min(length, (i * 1000) / fps);
      await page.evaluate(`window.__seek(${t})`);
      const buf = await page.screenshot({ type: "png" });
      if (enc) await write(buf);
      else writeFileSync(join(out, `${basename(id)}-${String(i).padStart(5, "0")}.png`), buf);
      if (!opts.quiet && !opts.json && process.stdout.isTTY && i % 5 === 0) process.stdout.write(`\r  Rendering ${info.title}: ${Math.round(((i + 1) / frames) * 100)}%`);
    }
    if (enc) {
      enc.stdin!.end();
      const code: number = await new Promise((ok) => enc!.on("close", ok));
      if (code !== 0) throw new Error(`ffmpeg couldn't encode ${basename(out)}: ${encErr.trim().split("\n").pop() || `exit code ${code}`}`);
    }
    if (!opts.quiet && !opts.json && process.stdout.isTTY) process.stdout.write("\r\x1b[K");
    say(`${pc.green("✓")} Wrote ${relative(process.cwd(), out)}: ${info.title}, ${size.width}×${size.height}, ${(length / 1000).toFixed(1)}s at ${fps}fps (${frames} frames in ${((Date.now() - started) / 1000).toFixed(0)}s)`);
    return { id, out, kind: ext === ".gif" ? "gif" : ext === "/" ? "frames" : "video", duration: length, frames };
  } finally {
    await browser.close();
  }
}
