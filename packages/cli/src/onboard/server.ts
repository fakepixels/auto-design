import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FONTS,
  FONT_CATALOG,
  FONT_STYLES,
  MOODS,
  fontsOf,
  PAIRINGS,
  SURFACES,
  specimenAssets,
  type DesignConfig,
} from "@auto-design/core";
import {
  PROVIDERS,
  applyPatch,
  describeChanges,
  extractFromSite,
  keysFromEnv,
  mergeCopy,
  mockDesigner,
  quickTweak,
  refine,
  setMockHandler,
  suggest,
  verifyKey,
  writeCopy,
  type DesignPatch,
  type Part,
  type ProviderId,
} from "@auto-design/ai";

import { presets } from "@auto-design/presets";
import pc from "picocolors";
import {
  MOTION_INFO,
  SURFACE_INFO,
  TEXTURE_INFO,
  addModelPick,
  choices,
  commit,
  createSession,
  errorText,
  KINDS,
  VIBES,
  generateOptions,
  heuristicTexture,
  productBrief,
  setKind,
  setProduct,
  setSurfaces,
  siteSuggestion,
  specimen,
  startFrom,
  undo,
  variants,
  type Session,
  type VariantField,
} from "./session.js";
import { publish, publishEnv, type Hosting } from "./publish.js";
import { serveStatic } from "../serve.js";

export interface OnboardOptions {
  /** Where the system repo will be created by default. */
  dir?: string;
  port: number;
  open: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));

function page(): string {
  for (const rel of ["./onboard.html", "./onboard/onboard.html"]) {
    const url = new URL(rel, import.meta.url);
    if (existsSync(url)) return readFileSync(url, "utf8");
  }
  throw new Error("onboard.html is missing from the auto-design package");
}

/** Say what went wrong reading a site in words a person can act on. */
function siteError(url: string, err: unknown): string {
  const text = errorText(err);
  const host = url.replace(/^https?:\/\//i, "").split("/")[0];
  if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network/i.test(text) || /fetch failed/i.test(String((err as Error)?.message))) {
    return `Couldn't reach ${host}. Check the address and your connection, or drop screenshots instead.`;
  }
  if (/Invalid URL/i.test(text)) return "That doesn't look like a web address. Try something like northwind.com.";
  return `Couldn't read ${host}: ${text}`;
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req: IncomingMessage, limit = 200_000): Promise<Record<string, any>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("That upload is too large. Use images under 4 MB.");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

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

const MIME: Record<string, string> = { ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff", ".js": "text/javascript; charset=utf-8" };

/**
 * Font stylesheets for every catalog face: the local npm package when installed,
 * else Google Fonts, a few families per request. Browsers only download a face's
 * files when a preview uses it, so linking the whole catalog stays light.
 */
function fontLinks(bases: string[]): string[] {
  const local: string[] = [];
  const google: string[] = [];
  for (const f of Object.values(FONTS)) {
    if (packageDir(f.package, bases)) local.push(`/pkg/${f.package}/index.css`);
    else {
      const weights = f.available.filter((w) => w >= 300 && w <= 700);
      google.push(weights.length <= 1 ? `family=${f.google.replace(/ /g, "+")}` : `family=${f.google.replace(/ /g, "+")}:wght@${weights.join(";")}`);
    }
  }
  for (let i = 0; i < google.length; i += 20) local.push(`https://fonts.googleapis.com/css2?${google.slice(i, i + 20).join("&")}&display=swap`);
  return local;
}

function openBrowser(url: string) {
  import("node:child_process").then(({ spawn }) => {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    try {
      spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
    } catch {
      /* the URL is printed */
    }
  });
}

/** The parts of a session the browser may see. The model key never leaves the server. */
function view(s: Session) {
  return {
    product: s.product,
    preset: s.preset,
    model: s.model ? { provider: s.model.provider, label: s.model.label, model: s.model.model ?? null } : null,
    choices: choices(s),
    fontIds: fontsOf(s.config),
    surfaces: s.config.surfaces ?? [],
    name: s.config.name,
    displayName: s.config.displayName,
    specimen: specimen(s.config),
    copy: s.copy,
    history: s.history.map((h) => ({ label: h.label, changes: h.changes })),
    generated: s.generated.map((g) => ({ id: g.id, name: g.name, tag: g.tag })),
    kind: s.kind,
    vibe: s.vibe,
  };
}

export async function runOnboard(opts: OnboardOptions) {
  const session = createSession();
  const fontBases = [process.cwd(), here];
  const env = keysFromEnv();
  const mock = process.env.AUTO_DESIGN_MOCK_MODEL === "1";
  if (mock) setMockHandler(mockDesigner(() => session.config));
  let studioUrl: string | null = null;
  let createdDir: string | null = null;
  const defaultDir = opts.dir ? resolve(opts.dir) : null;

  const modelOrNull = () => (session.model ? { provider: session.model.provider, apiKey: session.model.apiKey, model: session.model.model } : null);

  async function generateCopy() {
    const m = modelOrNull();
    if (!m || !session.product.name.trim()) return;
    try {
      const copy = await writeCopy(m, session.product.name, session.product.description);
      session.copy = Object.assign(copy, { byModel: true });
    } catch (err) {
      console.error(`${pc.yellow("~")} Couldn't write preview copy: ${errorText(err)}`);
    }
  }

  const routes: Record<string, (body: Record<string, any>) => Promise<unknown> | unknown> = {
    "GET /api/state": () => ({
      ...view(session),
      providers: Object.values(PROVIDERS).map((p) => ({ ...p, fromEnv: env.some((k) => k.provider === p.id) })).concat(
        mock ? [{ id: "mock", name: "Mock model", defaultModel: "mock", models: [{ id: "mock", label: "Mock model (offline)" }], keyHint: "anything", keyUrl: "", envVar: "", fromEnv: false, recommended: false }] as never[] : [],
      ),
      presets: Object.entries(presets).map(([id, p]) => ({ id, name: p.displayName, description: p.description })),
      kinds: KINDS,
      vibes: VIBES,
      textures: TEXTURE_INFO,
      motions: MOTION_INFO,
      surfacesInfo: Object.fromEntries(SURFACES.map((s) => [s, SURFACE_INFO[s]])),
      pairings: PAIRINGS.map((p) => ({ id: p.id, name: p.name, note: p.note, mood: p.mood })),
      moods: MOODS,
      fontStyles: FONT_STYLES,
      catalog: FONT_CATALOG.map((f) => ({ id: f.id, name: f.google, style: f.style, roles: f.roles, note: f.note })),
      fonts: fontLinks(fontBases),
      defaultDir: defaultDir ? relative(process.cwd(), defaultDir) || "." : null,
      cwd: process.cwd(),
    }),

    "POST /api/product": async (b) => {
      setProduct(session, { name: String(b.name ?? "").slice(0, 60), description: String(b.description ?? "").slice(0, 280), url: String(b.url ?? "").slice(0, 300) });
      await generateCopy();
      return view(session);
    },

    "POST /api/model": async (b) => {
      const provider = String(b.provider) as ProviderId;
      if (!(provider in PROVIDERS) && !(mock && provider === "mock")) throw new Error("Choose a provider.");
      const fromEnv = b.useEnv ? env.find((k) => k.provider === provider)?.apiKey : null;
      const apiKey = String(fromEnv ?? b.apiKey ?? "").trim();
      const model = b.model ? String(b.model) : undefined;
      const check = await verifyKey({ provider, apiKey, model });
      if (!check.ok) return { ok: false, error: check.error };
      session.model = { provider, apiKey, model, label: check.label };
      await generateCopy();
      return { ok: true, ...view(session) };
    },

    "POST /api/model/clear": () => {
      session.model = null;
      return view(session);
    },

    "POST /api/kind": (b) => {
      setKind(session, String(b.kind), b.vibe ? String(b.vibe) : null);
      // Options made from the material follow the kind.
      if (session.site || session.imageColors.length) generateOptions(session);
      return view(session);
    },

    "POST /api/start": (b) => {
      startFrom(session, String(b.preset));
      return view(session);
    },

    "POST /api/variants": (b) => variants(session, String(b.field) as VariantField, { mood: b.mood ? String(b.mood) : undefined, seed: Number.isFinite(b.seed) ? Number(b.seed) : undefined }),

    "POST /api/preview": (b) => specimen(applyPatch(session.config, (b.patch ?? {}) as Partial<DesignPatch>)),

    "POST /api/choose": (b) => {
      const patch = (b.patch ?? {}) as Partial<DesignPatch>;
      const next = applyPatch(session.config, patch);
      commit(session, next, String(b.label ?? "Changed the system"));
      return view(session);
    },

    "POST /api/surfaces": (b) => {
      setSurfaces(session, Array.isArray(b.surfaces) ? b.surfaces.map(String) : []);
      return view(session);
    },

    // Undo the last change, or the last few to go back to an earlier point.
    "POST /api/undo": (b) => {
      const count = Math.max(1, Math.min(50, Math.floor(Number(b.count) || 1)));
      let entry = null;
      for (let i = 0; i < count; i++) entry = undo(session) ?? entry;
      return { undone: entry ? entry.label : null, ...view(session) };
    },

    "POST /api/site": async (b) => {
      const url = String(b.url ?? session.product.url ?? "").trim();
      if (!url) throw new Error("Enter your site's address.");
      const material = await extractFromSite(url).catch((err) => {
        throw new Error(siteError(url, err));
      });
      const s = siteSuggestion(session, material);
      const made = generateOptions(session);
      return { material: { ...material, summary: undefined }, patch: s.patch, changes: s.changes, preview: s.preview, made: made.map((g) => ({ id: g.id, name: g.name, tag: g.tag })), ...view(session) };
    },

    // Starting points from the site that was read and the images' colors, next to the presets.
    "POST /api/generate": (b) => {
      const colors: string[] = (Array.isArray(b.colors) ? b.colors : []).map(String);
      // The person can pick which of the site's colors leads.
      if (session.site && b.siteBrand) {
        const lead = session.site.colors.find((c) => c.hex === String(b.siteBrand));
        if (lead) session.site = { ...session.site, colors: [lead, ...session.site.colors.filter((c) => c !== lead)] };
      }
      const made = generateOptions(session, colors);
      return { made: made.map((g) => ({ id: g.id, name: g.name, tag: g.tag })), ...view(session) };
    },

    "POST /api/suggest": async (b) => {
      const images: Part[] = (Array.isArray(b.images) ? b.images : [])
        .slice(0, 4)
        .filter((i: any) => typeof i?.data === "string" && /^image\/(png|jpeg|webp|gif)$/.test(i?.mediaType))
        .map((i: any) => ({ type: "image" as const, mediaType: i.mediaType, data: i.data }));
      const imageColors: string[] = (Array.isArray(b.colors) ? b.colors : []).map(String).filter((c: string) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6);
      const m = modelOrNull();
      if (m) {
        const r = await suggest(m, { product: session.product.name, description: productBrief(session), site: session.site, images, imageColors, current: session.config });
        addModelPick(session, r.config, r.reasons[0] ?? "");
        return { byModel: true, reasons: r.reasons, changes: r.changes, patch: r.patch, preview: specimen(r.config), ...view(session) };
      }
      // Without a model: the brand from the images or the site, the texture from the description.
      const patch: Partial<DesignPatch> = {};
      if (imageColors[0]) patch.brand = imageColors[0];
      else if (session.site?.colors[0]) patch.brand = session.site.colors[0].hex;
      const texture = heuristicTexture(session.product.description);
      if (texture !== session.config.texture) patch.texture = texture;
      const next = applyPatch(session.config, patch);
      return {
        byModel: false,
        reasons: [
          patch.brand ? `Brand color ${patch.brand} from your ${imageColors[0] ? "image" : "site"}.` : "Kept the current brand color.",
          `${TEXTURE_INFO[next.texture].name} texture from your description.`,
        ],
        changes: describeChanges(session.config, next),
        patch,
        preview: specimen(next),
      };
    },

    "POST /api/refine": async (b) => {
      const request = String(b.request ?? "").trim().slice(0, 400);
      if (!request) throw new Error("Describe the change you want.");
      const m = modelOrNull();
      if (m && !b.quick) {
        const earlier = session.history.filter((h) => h.label.startsWith("Asked: ")).map((h) => h.label.slice(7)).slice(-5);
        const r = await refine(m, session.config, request, { product: session.product.name, description: productBrief(session), earlier });
        commit(session, r.config, `Asked: ${request}`);
        return { summary: r.summary, changes: r.changes, ...view(session) };
      }
      const patch = quickTweak(session.config, request);
      const next = applyPatch(session.config, patch);
      const changes = describeChanges(session.config, next);
      if (!changes.length) return { summary: m ? "" : "Connect a model to make changes described in your own words.", changes, ...view(session) };
      commit(session, next, `Asked: ${request}`);
      return { summary: "", changes, ...view(session) };
    },

    "POST /api/copy": async () => {
      await generateCopy();
      return view(session);
    },

    "GET /api/publish/env": () => publishEnv(process.cwd()),

    "POST /api/publish": async (b) => {
      const dir = resolve(String(b.dir || `./${session.config.name}-design`));
      const displayName = String(b.displayName || session.config.displayName).slice(0, 60);
      const config: DesignConfig = { ...session.config, displayName, private: b.visibility === "private" ? true : session.config.private ?? false };
      const result = await publish({
        dir,
        config,
        copy: session.copy,
        visibility: b.visibility === "private" ? "private" : "public",
        github: b.github === "gh" || b.github === "token" ? b.github : "none",
        token: b.token ? String(b.token) : undefined,
        repoName: b.repoName ? String(b.repoName).replace(/[^\w.-]/g, "-").slice(0, 80) : undefined,
        hosting: (["pages", "vercel", "railway", "render", "intranet", "later"].includes(b.hosting) ? b.hosting : "later") as Hosting,
        model: modelOrNull(),
        saveKey: !!b.saveKey,
      });
      createdDir = result.dir;
      for (const st of result.steps) console.log(`${st.ok ? pc.green("✓") : pc.red("✗")} ${st.step}: ${st.detail}`);
      return { ...result, relDir: relative(process.cwd(), result.dir) || "." };
    },

    "POST /api/studio": async () => {
      if (!createdDir) throw new Error("Create the design system first.");
      if (studioUrl) return { url: studioUrl };
      const { runDev } = await import("../dev/server.js");
      const { port } = await runDev({ cwd: createdDir, apps: [], port: opts.port + 1, open: false });
      studioUrl = `http://localhost:${port}`;
      return { url: studioUrl };
    },
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    // Only this machine may drive the session.
    const host = req.headers.host ?? "";
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return send(res, 403, "Forbidden", "text/plain");
    try {
      if (req.method === "GET" && url.pathname === "/") return send(res, 200, page(), "text/html; charset=utf-8");
      // The design site that publishing just built, so onboarding can end on it.
      if (req.method === "GET" && createdDir && serveStatic(join(createdDir, "public"), "/site/", req, res)) return;
      if (req.method === "GET" && url.pathname === "/assets/renderer.css") return send(res, 200, specimenAssets().css, MIME[".css"]);
      if (req.method === "GET" && url.pathname === "/assets/renderer.js") return send(res, 200, specimenAssets().js, MIME[".js"]);
      if (req.method === "GET" && url.pathname.startsWith("/pkg/")) {
        const parts = url.pathname.slice(5).split("/").map(decodeURIComponent);
        const nameLen = parts[0]?.startsWith("@") ? 2 : 1;
        const name = parts.slice(0, nameLen).join("/");
        const dir = name ? packageDir(name, fontBases) : null;
        const file = dir ? normalize(join(dir, ...parts.slice(nameLen))) : null;
        if (!dir || !file || !file.startsWith(dir + sep) || !existsSync(file) || !MIME[extname(file)]) return send(res, 404, "Not found", "text/plain");
        res.writeHead(200, { "content-type": MIME[extname(file)]!, "cache-control": "max-age=3600" });
        return res.end(readFileSync(file));
      }
      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) return send(res, 404, { error: "Not found" });
      if (req.method === "POST" && req.headers["content-type"] !== "application/json") return send(res, 415, { error: "Send JSON." });
      const body = req.method === "POST" ? await readJson(req, url.pathname === "/api/suggest" ? 24_000_000 : 200_000) : {};
      return send(res, 200, await route(body));
    } catch (err) {
      send(res, 422, { error: errorText(err) });
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
  opts.port = port;

  const url = `http://localhost:${port}`;
  console.log(`\n  ${pc.bold("auto-design")}  ${pc.cyan(url)}`);
  console.log(`  ${pc.dim("Design your system in the browser. Nothing is written until you publish. Ctrl+C to stop.")}`);
  if (env.length) console.log(`  ${pc.dim(`Found ${env.map((k) => PROVIDERS[k.provider as keyof typeof PROVIDERS]?.envVar).join(", ")} in your environment.`)}`);
  console.log();
  if (opts.open) openBrowser(url);
  return { server, port, session };
}
