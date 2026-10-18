import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, watch, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ConfigError,
  BuildError,
  ROLE_NAMES,
  STEPS,
  buildSystem,
  emitAll,
  themeTokens,
  toCss,
  toHex,
  type DesignConfig,
  type DesignSystem,
} from "@auto-design/core";
import pc from "picocolors";
import { CONFIG_FILE, loadConfig, loadCopy, writeFiles } from "../commands.js";
import { applyEdits, editConfigSource, type StudioEdits } from "./config-edit.js";
import { studioPage } from "./studio.js";
import { syncApps } from "./sync.js";

export interface DevOptions {
  cwd: string;
  apps: string[];
  port: number;
  open: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));

/** Everything the studio needs to draw a system, in plain CSS strings. */
export function previewPayload(s: DesignSystem) {
  const roles = { light: {} as Record<string, string>, dark: {} as Record<string, string> };
  for (const mode of ["light", "dark"] as const) {
    for (const r of ROLE_NAMES) roles[mode][r] = toCss(s.roles[mode][r]);
  }
  const theme = themeTokens(s);
  const passed = s.report.checks.filter((c) => c.pass).length;
  return {
    name: s.config.displayName,
    seed: { css: toCss(s.brand.seed), hex: toHex(s.brand.seed), l: s.brand.seed.l, c: s.brand.seed.c, h: s.brand.seed.h },
    seedStep: s.brand.step,
    brand: s.config.color.brand,
    neutral: s.config.color.neutral,
    radius: s.config.shape.radius,
    roles,
    palettes: {
      brand: STEPS.map((step) => ({ step, css: toCss(s.palettes.brand[step]) })),
      neutral: STEPS.map((step) => ({ step, css: toCss(s.palettes.neutral[step]) })),
    },
    fonts: { sans: theme["--font-sans"], mono: theme["--font-mono"] },
    fontPackages: [s.type.fonts.sans, s.type.fonts.mono, s.type.fonts.display].map((f) => f?.package).filter(Boolean),
    report: { passed, total: s.report.checks.length, fixes: s.report.fixes, notes: s.report.notes },
  };
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 100_000) throw new Error("Request too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function parseEdits(body: unknown): StudioEdits {
  const b = (body ?? {}) as Record<string, unknown>;
  const edits: StudioEdits = {};
  if (typeof b.brand === "string" && b.brand.trim()) edits.brand = b.brand.trim().slice(0, 100);
  if (b.neutral === "cool" || b.neutral === "neutral" || b.neutral === "warm") edits.neutral = b.neutral;
  if (typeof b.radius === "number" && Number.isFinite(b.radius)) edits.radius = Math.round(b.radius);
  return edits;
}

function errorMessage(err: unknown): string {
  if (err instanceof ConfigError) return err.issues.map((i) => i.message).join(" ");
  if (err instanceof BuildError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

/** Locate an installed npm package directory, for serving font files to the studio. */
function packageDir(name: string, bases: string[]): string | null {
  for (const base of bases) {
    let dir = base;
    for (;;) {
      const candidate = join(dir, "node_modules", name);
      if (existsSync(join(candidate, "package.json"))) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* no browser available; the URL is printed */
  }
}

export async function runDev(opts: DevOptions) {
  const root = resolve(opts.cwd);
  const configPath = join(root, CONFIG_FILE);
  const apps = opts.apps.map((a) => resolve(a));
  const fontBases = [root, here, process.cwd()];

  let config: DesignConfig = await loadConfig(root);
  let system: DesignSystem = buildSystem(config);
  let lastWrite = "";
  const clients = new Set<ServerResponse>();

  const broadcast = (event: string, data: unknown) => {
    for (const c of clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const rebuild = (s: DesignSystem) => {
    writeFiles(root, emitAll(s, { copy: loadCopy(root) }));
    return syncApps(root, apps);
  };

  const logSync = (synced: string[]) => {
    if (synced.length) console.log(`${pc.green("✓")} Updated ${synced.filter((f) => f.endsWith(".css")).join(", ")}`);
  };

  logSync(rebuild(system));

  // Rebuild when design.config.ts changes on disk, whoever changed it.
  let timer: NodeJS.Timeout | undefined;
  watch(configPath, () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const source = readFileSync(configPath, "utf8");
      const hash = createHash("sha1").update(source).digest("hex");
      if (hash === lastWrite) return;
      lastWrite = hash;
      try {
        config = await loadConfig(root);
        system = buildSystem(config);
        const synced = rebuild(system);
        console.log(`${pc.green("✓")} Rebuilt from ${CONFIG_FILE}`);
        logSync(synced);
        broadcast("rebuilt", previewPayload(system));
      } catch (err) {
        console.error(`${pc.red("✗")} ${errorMessage(err)}`);
        broadcast("error", { message: errorMessage(err) });
      }
    }, 120);
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    // Only answer pages served from this machine: no DNS rebinding, no cross-site form posts.
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? "")) return send(res, 403, "Forbidden", "text/plain");
    if (req.method === "POST" && req.headers["content-type"] !== "application/json") return send(res, 415, { error: "Send JSON." });
    try {
      if (req.method === "GET" && url.pathname === "/") {
        return send(res, 200, studioPage(), "text/html; charset=utf-8");
      }
      if (req.method === "GET" && url.pathname === "/api/state") {
        return send(res, 200, { ...previewPayload(system), apps: apps.map((a) => relative(process.cwd(), a) || ".") });
      }
      if (req.method === "POST" && url.pathname === "/api/preview") {
        const edits = parseEdits(await readJson(req));
        try {
          return send(res, 200, previewPayload(buildSystem(applyEdits(config, edits))));
        } catch (err) {
          return send(res, 422, { error: errorMessage(err) });
        }
      }
      if (req.method === "POST" && url.pathname === "/api/save") {
        const edits = parseEdits(await readJson(req));
        let next: DesignSystem;
        try {
          next = buildSystem(applyEdits(config, edits));
        } catch (err) {
          return send(res, 422, { error: errorMessage(err) });
        }
        const source = editConfigSource(readFileSync(configPath, "utf8"), config, edits);
        lastWrite = createHash("sha1").update(source).digest("hex");
        writeFileSync(configPath, source);
        config = applyEdits(config, edits);
        system = next;
        const synced = rebuild(system);
        console.log(`${pc.green("✓")} Saved ${CONFIG_FILE} from the studio`);
        logSync(synced);
        return send(res, 200, { ...previewPayload(system), synced });
      }
      if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/pkg/")) {
        const parts = url.pathname.slice(5).split("/").map(decodeURIComponent);
        const nameLen = parts[0]?.startsWith("@") ? 2 : 1;
        const name = parts.slice(0, nameLen).join("/");
        const dir = name ? packageDir(name, fontBases) : null;
        const file = dir ? normalize(join(dir, ...parts.slice(nameLen))) : null;
        if (!dir || !file || !file.startsWith(dir + sep) || !existsSync(file) || !MIME[extname(file)]) {
          return send(res, 404, "Not found", "text/plain");
        }
        res.writeHead(200, { "content-type": MIME[extname(file)]!, "cache-control": "max-age=3600" });
        return res.end(readFileSync(file));
      }
      send(res, 404, "Not found", "text/plain");
    } catch (err) {
      send(res, 500, { error: errorMessage(err) });
    }
  });

  const port = await new Promise<number>((resolvePort, reject) => {
    let p = opts.port;
    const tryListen = () => {
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && p < opts.port + 20) {
          p++;
          tryListen();
        } else reject(err);
      });
      server.listen(p, "127.0.0.1", () => resolvePort(p));
    };
    tryListen();
  });

  const url = `http://localhost:${port}`;
  console.log(`\n  ${pc.bold("auto-design studio")}  ${pc.cyan(url)}`);
  console.log(`  ${pc.dim(`Editing ${relative(process.cwd(), configPath)}`)}`);
  if (apps.length) console.log(`  ${pc.dim(`Keeping in sync: ${apps.map((a) => relative(process.cwd(), a)).join(", ")}`)}`);
  console.log(`  ${pc.dim("Edits to design.config.ts by hand are picked up too. Ctrl+C to stop.")}\n`);
  if (opts.open) openBrowser(url);
  return { server, port };
}
