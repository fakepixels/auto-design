import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { buildSystem, emitAll, type DesignConfig, type SpecimenCopy } from "@auto-design/core";
import { PROVIDERS, type ModelConfig, type Photo } from "@auto-design/ai";
import { localPhotoFile, writePhotos } from "./photos.js";
import { attachCustom, loadCustom } from "../custom.js";
import { COPY_FILE, CONFIG_FILE, WORKFLOW, configSource, systemPackageJson, systemReadme, writeFiles, writeSite } from "../commands.js";

/**
 * Publishing: write the system repo, commit it, put it on GitHub and set up
 * hosting. Each step reports what it did in plain words, so a failure at one
 * step leaves everything before it usable.
 */

export type Hosting = "pages" | "vercel" | "railway" | "render" | "intranet" | "later";

export interface PublishOptions {
  dir: string;
  config: DesignConfig;
  copy: SpecimenCopy;
  visibility: "public" | "private";
  github: "gh" | "token" | "none";
  token?: string;
  repoName?: string;
  hosting: Hosting;
  model?: ModelConfig | null;
  saveKey?: boolean;
  /** Photos the system starts with, in page order, and the bytes of the person's own. */
  photos?: Photo[];
  ownPhotos?: Map<string, { mediaType: string; data: Buffer }>;
}

export interface StepResult {
  step: string;
  ok: boolean;
  detail: string;
  url?: string;
}

export interface PublishResult {
  dir: string;
  steps: StepResult[];
  repoUrl: string | null;
  siteUrl: string | null;
  registryUrl: string | null;
}

function run(cmd: string, args: string[], cwd: string, timeout = 120_000) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout, env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" } });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() || (r.error?.message ?? "") };
}

const has = (cmd: string) => run(cmd, ["--version"], process.cwd(), 10_000).ok;

/** What this machine can publish with, for the last onboarding screen. */
export function publishEnv(cwd: string) {
  const git = has("git");
  const ghInstalled = has("gh");
  let ghUser: string | null = null;
  if (ghInstalled) {
    const r = run("gh", ["api", "user", "--jq", ".login"], cwd, 15_000);
    if (r.ok && r.out) ghUser = r.out;
  }
  const vercelInstalled = has("vercel");
  let vercelUser: string | null = null;
  if (vercelInstalled) {
    const r = run("vercel", ["whoami"], cwd, 15_000);
    if (r.ok && r.out) vercelUser = r.out.split("\n").pop() ?? null;
  }
  return { cwd, git, gh: { installed: ghInstalled, user: ghUser }, vercel: { installed: vercelInstalled, user: vercelUser } };
}

const PAGES_WORKFLOW = `name: docs
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: public
      - id: deployment
        uses: actions/deploy-pages@v4
`;

/** A static server for private hosting: every request needs the registry token. No dependencies. */
export const PRIVATE_SERVER = `// Serves public/ (the docs site and the shadcn registry) behind a token.
// Set REGISTRY_TOKEN in your host's environment. Apps install with:
//   AUTO_DESIGN_TOKEN=... npx auto-design add https://your-host/r/
// and shadcn reads the same token from components.json headers.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(import.meta.dirname, "public");
const token = process.env.REGISTRY_TOKEN;
const types = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };

if (!token) console.warn("REGISTRY_TOKEN is not set: the registry is open to anyone who finds it.");

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const cookie = /(?:^|; )ad_token=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  const given = req.headers.authorization?.replace(/^Bearer\\s+/i, "") ?? url.searchParams.get("token") ?? cookie;
  if (token && given !== token) {
    res.writeHead(401, { "content-type": "text/plain" });
    return res.end("This design system is private. Add ?token=... or an Authorization: Bearer header.");
  }
  const headers = url.searchParams.get("token") ? { "set-cookie": \`ad_token=\${token}; HttpOnly; Secure; SameSite=Lax; Path=/\` } : {};
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\\\])+/, "");
  // Site pages are folders: send /docs/colors to /docs/colors/ so relative links resolve.
  if (path && !path.endsWith("/") && !extname(path)) {
    res.writeHead(301, { location: url.pathname + "/" + url.search, ...headers });
    return res.end();
  }
  if (!path || path.endsWith("/")) path += "index.html";
  const file = join(root, path);
  if (!file.startsWith(root)) return res.writeHead(400).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache", ...headers });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}).listen(process.env.PORT ?? 3000);
`;

function hostingFiles(hosting: Hosting, name: string): Record<string, string> {
  switch (hosting) {
    case "pages":
      return { ".github/workflows/docs.yml": PAGES_WORKFLOW };
    case "vercel":
      return { "vercel.json": JSON.stringify({ $schema: "https://openapi.vercel.sh/vercel.json", buildCommand: "", installCommand: "", outputDirectory: "public", framework: null, cleanUrls: false, trailingSlash: true }, null, 2) + "\n" };
    case "railway":
      return {
        "server.mjs": PRIVATE_SERVER,
        "railway.json": JSON.stringify({ $schema: "https://railway.com/railway.schema.json", deploy: { startCommand: "node server.mjs" } }, null, 2) + "\n",
      };
    case "render":
      return {
        "server.mjs": PRIVATE_SERVER,
        "render.yaml": `services:\n  - type: web\n    name: ${name}\n    runtime: node\n    buildCommand: "true"\n    startCommand: node server.mjs\n    envVars:\n      - key: REGISTRY_TOKEN\n        generateValue: true\n`,
      };
    default:
      return {};
  }
}

function readme(config: DesignConfig, extra: string): string {
  return systemReadme(buildSystem(config)) + extra;
}

/** Write the system repo to disk. Refuses to write into a folder that already has files. */
/** Preview copy without the flag that says a model wrote it. */
const copyOf = (copy: SpecimenCopy): SpecimenCopy => {
  const { byModel: _b, ...rest } = copy as SpecimenCopy & { byModel?: boolean };
  return rest as SpecimenCopy;
};

export function writeRepo(opts: PublishOptions): string[] {
  const dir = resolve(opts.dir);
  if (existsSync(dir) && readdirSync(dir).some((f) => f !== ".DS_Store")) {
    throw new Error(`${dir} already has files in it. Choose an empty or new folder.`);
  }
  const s = buildSystem(opts.config);
  const { byModel: _b, ...copy } = opts.copy as SpecimenCopy & { byModel?: boolean };
  const pkg = JSON.parse(systemPackageJson(s));
  if (opts.hosting === "railway" || opts.hosting === "render") pkg.scripts.start = "node server.mjs";
  const files: Record<string, string> = {
    [CONFIG_FILE]: configSource(opts.config),
    [COPY_FILE]: JSON.stringify(copy, null, 2) + "\n",
    "package.json": JSON.stringify(pkg, null, 2) + "\n",
    "README.md": readme(opts.config, hostingReadme(opts.hosting)),
    ".github/workflows/design-system.yml": WORKFLOW,
    ".gitignore": "node_modules/\n.env*.local\n.vercel\n.auto-design/\n",
    ...hostingFiles(opts.hosting, opts.config.name),
    ...emitAll(s, { copy: copy as SpecimenCopy }),
  };
  if (opts.saveKey && opts.model && opts.model.provider !== "mock") {
    const info = PROVIDERS[opts.model.provider as keyof typeof PROVIDERS];
    files[".env.local"] = `# Used by auto-design review. Never commit this file.\nAUTO_DESIGN_PROVIDER=${opts.model.provider}\n${info.envVar}=${opts.model.apiKey}\n${opts.model.model ? `AUTO_DESIGN_MODEL=${opts.model.model}\n` : ""}`;
  }
  writeFiles(dir, files);
  return Object.keys(files);
}

function hostingReadme(hosting: Hosting): string {
  switch (hosting) {
    case "pages":
      return "\n## Hosting\n\nGitHub Pages serves `public/` on every push to main (`.github/workflows/docs.yml`).\n";
    case "vercel":
      return "\n## Hosting\n\nVercel serves `public/` as a static site (`vercel.json`). Import the repo at vercel.com/new, or run `npx vercel deploy --prod`.\n";
    case "railway":
    case "render":
      return "\n## Hosting\n\n`server.mjs` serves `public/` behind a token. Set `REGISTRY_TOKEN` in the host's environment, then install with\n`AUTO_DESIGN_TOKEN=<token> npx auto-design add https://<host>/r/`.\n";
    case "intranet":
      return "\n## Hosting\n\n`public/` is a static site: the docs page and the shadcn registry. Put it behind your existing single sign-on.\n";
    default:
      return "";
  }
}

export async function publish(opts: PublishOptions): Promise<PublishResult> {
  const dir = resolve(opts.dir);
  const steps: StepResult[] = [];
  let repoUrl: string | null = null;
  let siteUrl: string | null = null;
  let owner: string | null = null;
  const repoName = opts.repoName || `${opts.config.name}-design`;

  // 1. Files, the photos, then the design site.
  const files = writeRepo(opts);
  steps.push({ step: "Write the design system", ok: true, detail: `${files.length} files in ${relative(process.cwd(), dir) || dir}` });
  if (opts.photos?.length) {
    const local = process.env.AUTO_DESIGN_PHOTOS_DIR ? (name: string) => localPhotoFile(process.env.AUTO_DESIGN_PHOTOS_DIR!, name) : undefined;
    const photos = await writePhotos(dir, opts.photos, opts.ownPhotos ?? new Map(), local);
    // DESIGN.md and the registry list the photos, so emit again now that they're on disk.
    if (photos.written.length) writeFiles(dir, emitAll(attachCustom(buildSystem(opts.config), loadCustom(dir)), { copy: copyOf(opts.copy) }));
    steps.push(
      photos.written.length
        ? { step: "Add the photos", ok: true, detail: `${photos.written.length} in images/, with their credits in images/CREDITS.md${photos.failed.length ? `. Couldn't download ${photos.failed.length}; add them later` : ""}` }
        : { step: "Add the photos", ok: false, detail: "Couldn't download the photos. Add your own to images/ and list them in images/credits.json." },
    );
  }
  const { byModel: _b, ...copy } = opts.copy as SpecimenCopy & { byModel?: boolean };
  const site = await writeSite(dir, buildSystem(opts.config), { copy: copy as SpecimenCopy });
  steps.push(
    site.error
      ? { step: "Build the design site", ok: false, detail: `${site.error}. public/index.html is a single page for now; run npx auto-design build to try again.` }
      : { step: "Build the design site", ok: true, detail: `${site.pages} pages: home, docs and a page for every component, with live examples` },
  );

  // 2. Git.
  if (!has("git")) {
    steps.push({ step: "Commit", ok: false, detail: "git isn't installed, so the repo wasn't committed. Install git and run `git init` in the folder." });
    return { dir, steps, repoUrl, siteUrl, registryUrl: null };
  }
  run("git", ["init", "-b", "main"], dir);
  run("git", ["add", "-A"], dir);
  const named = run("git", ["config", "user.email"], dir).out;
  const identity = named ? [] : ["-c", "user.name=auto-design", "-c", "user.email=auto-design@users.noreply.github.com"];
  const commit = run("git", [...identity, "commit", "-m", `Create the ${opts.config.displayName} design system`, "-m", "Generated by auto-design from design.config.ts."], dir);
  steps.push(commit.ok ? { step: "Commit", ok: true, detail: "First commit on main" } : { step: "Commit", ok: false, detail: commit.err || "git commit failed" });
  if (!commit.ok) return { dir, steps, repoUrl, siteUrl, registryUrl: null };

  // 3. GitHub.
  if (opts.github === "gh") {
    const user = run("gh", ["api", "user", "--jq", ".login"], dir, 20_000);
    owner = user.ok ? user.out : null;
    const r = run("gh", ["repo", "create", repoName, `--${opts.visibility}`, "--source", dir, "--remote", "origin", "--push", "--description", `${opts.config.displayName} design system, generated by auto-design`], dir, 180_000);
    if (r.ok) {
      repoUrl = owner ? `https://github.com/${owner}/${repoName}` : (r.out.match(/https:\/\/github\.com\/\S+/)?.[0] ?? null);
      steps.push({ step: "Create the GitHub repo", ok: true, detail: `Pushed to ${repoUrl}`, url: repoUrl ?? undefined });
    } else {
      steps.push({ step: "Create the GitHub repo", ok: false, detail: r.err || "gh repo create failed" });
    }
  } else if (opts.github === "token" && opts.token) {
    try {
      const auth = { authorization: `Bearer ${opts.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
      const me = await fetch("https://api.github.com/user", { headers: auth });
      if (!me.ok) throw new Error(me.status === 401 ? "GitHub rejected the token." : `GitHub answered ${me.status}.`);
      owner = ((await me.json()) as { login: string }).login;
      const created = await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ name: repoName, private: opts.visibility === "private", description: `${opts.config.displayName} design system, generated by auto-design` }),
      });
      if (!created.ok) {
        const body = (await created.json().catch(() => ({}))) as { message?: string; errors?: { message?: string }[] };
        throw new Error(body.errors?.[0]?.message ?? body.message ?? `GitHub answered ${created.status}.`);
      }
      repoUrl = `https://github.com/${owner}/${repoName}`;
      run("git", ["remote", "add", "origin", `${repoUrl}.git`], dir);
      const basic = Buffer.from(`x-access-token:${opts.token}`).toString("base64");
      const push = run("git", ["-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`, "push", "-u", "origin", "main"], dir, 180_000);
      if (!push.ok) throw new Error(push.err || "git push failed");
      steps.push({ step: "Create the GitHub repo", ok: true, detail: `Pushed to ${repoUrl}`, url: repoUrl });
    } catch (err) {
      steps.push({ step: "Create the GitHub repo", ok: false, detail: (err as Error).message });
    }
  }

  // 4. Hosting.
  const pushed = !!repoUrl && steps.at(-1)?.ok;
  switch (opts.hosting) {
    case "pages": {
      if (!pushed || !owner) {
        steps.push({ step: "Turn on GitHub Pages", ok: false, detail: "Needs the GitHub repo first. Push it, then enable Pages with source: GitHub Actions." });
        break;
      }
      const r = opts.github === "gh"
        ? run("gh", ["api", "-X", "POST", `repos/${owner}/${repoName}/pages`, "-f", "build_type=workflow"], dir, 30_000)
        : await fetch(`https://api.github.com/repos/${owner}/${repoName}/pages`, {
            method: "POST",
            headers: { authorization: `Bearer ${opts.token}`, accept: "application/vnd.github+json", "content-type": "application/json" },
            body: JSON.stringify({ build_type: "workflow" }),
          }).then((res) => ({ ok: res.ok, err: `GitHub answered ${res.status}` }));
      siteUrl = `https://${owner.toLowerCase()}.github.io/${repoName}/`;
      steps.push(
        r.ok
          ? { step: "Turn on GitHub Pages", ok: true, detail: "The docs site builds on every push. The first build takes about a minute.", url: siteUrl }
          : { step: "Turn on GitHub Pages", ok: false, detail: `${r.err}. Private repos need a paid GitHub plan for Pages; you can enable it under Settings → Pages.` },
      );
      if (!r.ok) siteUrl = null;
      break;
    }
    case "vercel": {
      const env = publishEnv(dir);
      if (env.vercel.user) {
        const r = run("vercel", ["deploy", "--prod", "--yes"], dir, 300_000);
        const url = r.out.match(/https:\/\/\S+\.vercel\.app/g)?.pop() ?? null;
        siteUrl = r.ok ? url : null;
        steps.push(r.ok ? { step: "Deploy to Vercel", ok: true, detail: "Deployed the docs site and registry.", url: url ?? undefined } : { step: "Deploy to Vercel", ok: false, detail: r.err || "vercel deploy failed" });
      } else {
        const link = repoUrl ? `https://vercel.com/new/clone?repository-url=${encodeURIComponent(repoUrl)}` : "https://vercel.com/new";
        steps.push({ step: "Deploy to Vercel", ok: true, detail: "vercel.json is in the repo. Import it on Vercel to deploy; it serves public/ as is.", url: link });
      }
      break;
    }
    case "railway":
      steps.push({ step: "Deploy to Railway", ok: true, detail: "server.mjs serves the system behind REGISTRY_TOKEN. Create a Railway project from the repo and set that variable.", url: "https://railway.com/new/github" });
      break;
    case "render":
      steps.push({ step: "Deploy to Render", ok: true, detail: "render.yaml sets up a private web service with a generated REGISTRY_TOKEN.", url: repoUrl ? `https://render.com/deploy?repo=${encodeURIComponent(repoUrl)}` : "https://dashboard.render.com/blueprints" });
      break;
    case "intranet":
      steps.push({ step: "Intranet", ok: true, detail: `Serve ${relative(process.cwd(), join(dir, "public")) || "public"}/ behind your sign-on. It is the docs page and the registry.` });
      break;
    default:
      break;
  }
  const registryUrl = siteUrl ? `${siteUrl.replace(/\/?$/, "/")}r/` : null;
  return { dir, steps, repoUrl, siteUrl, registryUrl };
}

/** Save a model key for an existing system repo, for later studio and review sessions. */
export function saveKey(dir: string, model: ModelConfig) {
  if (model.provider === "mock") return;
  const info = PROVIDERS[model.provider as keyof typeof PROVIDERS];
  writeFileSync(join(dir, ".env.local"), `AUTO_DESIGN_PROVIDER=${model.provider}\n${info.envVar}=${model.apiKey}\n`);
}
