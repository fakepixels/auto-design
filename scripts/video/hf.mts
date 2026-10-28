// Shared by the video scripts: the pinned HyperFrames CLI, ffmpeg, and the README's marked blocks.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** Pinned so a film re-renders the same way next month. Move it with care: check the film after. */
export const HYPERFRAMES = "hyperframes@0.8.214";

/** Chrome for HyperFrames: its own download on a laptop, the preinstalled headless shell in a sandbox. */
function browserEnv(): Record<string, string> {
  if (process.env.HYPERFRAMES_BROWSER_PATH) return {};
  const base = "/opt/pw-browsers";
  if (!existsSync(base)) return {};
  for (const dir of readdirSync(base).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()) {
    const bin = path.join(base, dir, "chrome-headless-shell-linux64", "chrome-headless-shell");
    if (existsSync(bin)) return { HYPERFRAMES_BROWSER_PATH: bin };
  }
  return {};
}

/** Run the HyperFrames CLI in a project folder. No telemetry, no update checks. */
export function hf(project: string, args: string[], opts: { quiet?: boolean } = {}): { ok: boolean; out: string } {
  const r = spawnSync("npx", ["--yes", HYPERFRAMES, ...args], {
    cwd: project,
    encoding: "utf8",
    env: { ...process.env, ...browserEnv(), HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1", DO_NOT_TRACK: "1" },
    stdio: opts.quiet ? "pipe" : ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = r.stdout ?? "";
  if (!opts.quiet && out) process.stdout.write(out.split("\n").filter((l) => !/^\s*$/.test(l)).slice(-6).join("\n") + "\n");
  return { ok: r.status === 0, out };
}

/** `hyperframes check --json`, failing on errors and printing warnings in one line each. */
export function check(project: string): void {
  const { out } = hf(project, ["check", "--json"], { quiet: true });
  const json = JSON.parse(out.slice(out.indexOf("{")));
  const findings: { severity: string; code: string; message: string }[] = [];
  const walk = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o.findings)) findings.push(...o.findings);
    for (const k of Object.keys(o)) if (k !== "findings") walk(o[k]);
  };
  walk(json);
  const errors = findings.filter((f) => f.severity === "error");
  for (const f of findings.filter((f) => f.severity === "warning")) console.log(`  ~ ${f.code}: ${f.message.slice(0, 140)}`);
  if (errors.length) {
    for (const f of errors) console.error(`  ✗ ${f.code}: ${f.message}`);
    throw new Error(`hyperframes check found ${errors.length} error(s) in ${path.relative(ROOT, project)}.`);
  }
}

export function ffmpeg(args: string[]): void {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ffmpeg ${args.join(" ")}`);
}

export function duration(file: string): number {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

/** The MP4 for the README link and a looping animated WebP that GitHub plays inline. */
export function encodeForReadme(src: string, mp4: string, webp: string, opts: { width: number; fps: number; quality: number }): void {
  ffmpeg(["-i", src, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4]);
  ffmpeg(["-i", src, "-vf", `fps=${opts.fps},scale=${opts.width}:-2:flags=lanczos`, "-c:v", "libwebp_anim", "-lossless", "0", "-q:v", String(opts.quality), "-compression_level", "6", "-loop", "0", "-an", webp]);
}

export const mb = (file: string) => `${(statSync(file).size / 1024 / 1024).toFixed(1)} MB`;

/** Hash files and values, to tell when a film needs rendering again. */
export function fingerprint(parts: (string | { file: string })[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(typeof p === "string" ? p : readFileSync(p.file));
  return h.digest("hex").slice(0, 16);
}

/** Replace what sits between `<!-- name:start -->` and `<!-- name:end -->` in the README. */
export function writeBlock(name: string, body: string): void {
  const file = path.join(ROOT, "README.md");
  const md = readFileSync(file, "utf8");
  const start = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`;
  const a = md.indexOf(start), b = md.indexOf(end);
  if (a < 0 || b < a) throw new Error(`README.md has no ${start} ... ${end} block.`);
  writeFileSync(file, md.slice(0, a + start.length) + "\n" + body.trim() + "\n" + md.slice(b));
}

export function readBlock(name: string): string {
  const md = readFileSync(path.join(ROOT, "README.md"), "utf8");
  const start = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`;
  const a = md.indexOf(start), b = md.indexOf(end);
  return a < 0 || b < a ? "" : md.slice(a + start.length, b).trim();
}

export function longDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function shortSha(): string {
  return spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
}
