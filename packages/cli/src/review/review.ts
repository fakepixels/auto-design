import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { critique, keysFromEnv, rulesForReview, type Critique, type ModelConfig, type ProviderId } from "@auto-design/ai";
import pc from "picocolors";
import { launchBrowser } from "../agents.js";
import { loadContext } from "../mcp/context.js";
import { AUDIT_SCRIPT, type AuditFinding, type AuditInput } from "./audit.js";

/**
 * `auto-design review`: open the app in a real browser at desktop and phone
 * widths, in light and dark mode, and check what it drew. The audit is
 * deterministic (colors, contrast, type, tap targets, sideways scrolling);
 * with a model key, a design critique against the system's rules follows.
 */

export interface ReviewOptions {
  targets: string[];
  cwd: string;
  base?: string;
  widths: number[];
  modes: ("light" | "dark")[];
  out: string;
  model: boolean;
  json: boolean;
  comment: boolean;
  failOn: "error" | "warn" | "never";
}

export interface ScreenResult {
  label: string;
  url: string;
  width: number;
  mode: "light" | "dark";
  file: string;
  findings: AuditFinding[];
  errors: string[];
}

export interface ReviewResult {
  product: string;
  screens: ScreenResult[];
  measured: (AuditFinding & { screens: string[] })[];
  critique: Critique | null;
  critiqueNote: string;
  errors: number;
  warnings: number;
  reportPath: string;
}

export const REVIEW_MARKER = "<!-- auto-design-review -->";

/** Read KEY=value lines from .env.local and .env without overriding the real environment. */
export function loadLocalEnv(dir: string) {
  for (const f of [".env.local", ".env"]) {
    const path = join(dir, f);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || process.env[m[1]!] !== undefined) continue;
      process.env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

export function modelFromEnv(): ModelConfig | null {
  const keys = keysFromEnv();
  if (!keys.length) return null;
  const wanted = process.env.AUTO_DESIGN_PROVIDER as ProviderId | undefined;
  const pick = keys.find((k) => k.provider === wanted) ?? keys[0]!;
  return { provider: pick.provider, apiKey: pick.apiKey, model: process.env.AUTO_DESIGN_MODEL || undefined };
}

function targetUrl(t: string, base?: string): string {
  if (/^https?:\/\//.test(t) || t.startsWith("file:")) return t;
  // A built page on disk (an export, a Storybook story) is reviewed as a file.
  if (/\.html?$/i.test(t) && existsSync(t)) return pathToFileURL(resolve(t)).href;
  if (t.startsWith("/") && base) return base.replace(/\/$/, "") + t;
  if (base) return `${base.replace(/\/$/, "")}/${t}`;
  return `http://${t}`;
}

function labelFor(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === "file:" ? u.pathname.split("/").pop() || url : u.pathname + u.search || "/";
  } catch {
    return url;
  }
}

const slug = (s: string) => s.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "home";

export function reportMarkdown(r: Omit<ReviewResult, "reportPath">, outDir: string): string {
  const lines = [REVIEW_MARKER, `## Design review: ${r.product}`, ""];
  if (r.critique) {
    const word = { ship: "Ready to ship.", polish: "Needs polish.", fix: "Needs fixes." }[r.critique.verdict];
    lines.push(`**${word}** ${r.critique.summary}`, "");
    if (r.critique.issues.length) {
      lines.push("| | Screen | Where | Problem | Fix |", "| --- | --- | --- | --- | --- |");
      for (const i of r.critique.issues) lines.push(`| ${i.severity} | ${i.screen} | ${i.area} | ${i.problem} | ${i.fix} |`);
      lines.push("");
    }
  } else {
    lines.push(`_${r.critiqueNote}_`, "");
  }
  lines.push("### Measured", "");
  if (r.measured.length) {
    lines.push("| | Rule | Finding | Screens | Where |", "| --- | --- | --- | --- | --- |");
    for (const f of r.measured) {
      const where = f.where.map((w) => `\`${w.replace(/\|/g, "\\|")}\``).join(", ");
      lines.push(`| ${f.severity} | ${f.rule} | ${f.message} | ${f.screens.length > 3 ? `${f.screens.length} screens` : f.screens.join(", ")} | ${where} |`);
    }
  } else lines.push("No problems: colors, contrast, type, tap targets and layout are on-system on every screen.");
  const runtime = r.screens.flatMap((s) => s.errors.map((e) => `${s.label}: ${e}`));
  if (runtime.length) lines.push("", "### Page errors", "", ...runtime.slice(0, 10).map((e) => `- ${e}`));
  lines.push("", `${r.screens.length} screen${r.screens.length === 1 ? "" : "s"}: ${[...new Set(r.screens.map((s) => s.label.split(" @ ")[0]))].join(", ")} at ${[...new Set(r.screens.map((s) => s.width))].join(" and ")}px, ${[...new Set(r.screens.map((s) => s.mode))].join(" and ")}. Screenshots: \`${outDir}\`.`);
  return lines.join("\n") + "\n";
}

export async function runReview(opts: ReviewOptions): Promise<ReviewResult> {
  const ctx = await loadContext(opts.cwd);
  const theme = ctx.theme;
  if (!theme) throw new Error("This app's auto-design.json predates reviews. Run `npx auto-design add` again to refresh it.");
  loadLocalEnv(ctx.root);
  const outDir = resolve(opts.out);
  mkdirSync(outDir, { recursive: true });
  const targets = (opts.targets.length ? opts.targets : ["http://localhost:3000/"]).map((t) => targetUrl(t, opts.base));
  const families = [theme.fonts.sans, theme.fonts.mono, theme.fonts.display]
    .filter((f) => !!f)
    .flatMap((f) => [f!.family.toLowerCase(), f!.family.toLowerCase().replace(/ variable$/, "")]);

  const screens: ScreenResult[] = [];
  const forModel: { label: string; png: Buffer }[] = [];
  const browser = await launchBrowser();
  try {
    for (const url of targets) {
      for (const width of opts.widths) {
        for (const mode of opts.modes) {
          const mobile = width < 600;
          const label = `${labelFor(url)} @ ${width}px ${mode}`;
          const page = await browser.newPage({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: 1, colorScheme: mode });
          const errors: string[] = [];
          page.on("pageerror", (e) => errors.push((e as Error).message));
          try {
            await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
          } catch (e) {
            await page.close();
            throw new Error(`Couldn't open ${url}: ${(e as Error).message.split("\n")[0]}. Is the app running?`);
          }
          // Light-first systems opt into dark with .dark; dark-first ones opt into light with .light.
          await page.evaluate(`(() => { const r = document.documentElement; r.classList.toggle("dark", ${mode === "dark"}); r.classList.toggle("light", ${mode === "light"}); })()`);
          await page.waitForTimeout(350);
          const input: AuditInput = { colors: theme.colors[mode]!, families, sizes: Object.values(theme.text), mobile };
          const findings = (await page.evaluate(`(${AUDIT_SCRIPT})(${JSON.stringify(input)})`)) as AuditFinding[];
          const file = join(outDir, `${slug(labelFor(url))}-${width}-${mode}.png`);
          writeFileSync(file, await page.screenshot({ fullPage: true, type: "png" }));
          if (forModel.length < 6) forModel.push({ label, png: await page.screenshot({ type: "png" }) });
          await page.close();
          screens.push({ label, url, width, mode, file, findings, errors });
          const errs = findings.filter((f) => f.severity === "error").length;
          if (!opts.json) console.log(`${errs ? pc.red("✗") : findings.length ? pc.yellow("!") : pc.green("✓")} ${label} ${pc.dim(`${findings.length} finding${findings.length === 1 ? "" : "s"}`)}`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  // Merge the same finding across screens.
  const merged = new Map<string, AuditFinding & { screens: string[] }>();
  for (const s of screens) {
    for (const f of s.findings) {
      const key = `${f.rule}|${f.message}`;
      const m = merged.get(key) ?? { ...f, where: [], count: 0, screens: [] };
      m.count += f.count;
      m.screens.push(s.label);
      for (const w of f.where) if (m.where.length < 3 && !m.where.includes(w)) m.where.push(w);
      merged.set(key, m);
    }
  }
  const measured = [...merged.values()].sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === "error" ? -1 : 1));

  let crit: Critique | null = null;
  let critiqueNote = "";
  const model = opts.model ? modelFromEnv() : null;
  if (!opts.model) critiqueNote = "Design critique skipped (--no-model).";
  else if (!model) critiqueNote = "No model key found, so this is the measured audit only. Set ANTHROPIC_API_KEY (or OPENAI_API_KEY, OPENROUTER_API_KEY) for a design critique.";
  else {
    if (!opts.json) console.log(pc.dim("Asking the model for a design critique…"));
    try {
      crit = await critique(model, {
        product: theme.product,
        rules: rulesForReview(ctx.designMd),
        screens: forModel,
        measured: measured.slice(0, 20).map((m) => `${m.rule}: ${m.message}`),
      });
    } catch (e) {
      critiqueNote = `The design critique failed: ${(e as Error).message}`;
    }
  }

  const errors = measured.filter((m) => m.severity === "error").length + screens.reduce((n, s) => n + s.errors.length, 0);
  const warnings = measured.filter((m) => m.severity === "warn").length;
  const relOut = relative(process.cwd(), outDir) || ".";
  const result = { product: theme.product, screens, measured, critique: crit, critiqueNote, errors, warnings };
  const md = reportMarkdown(result, relOut);
  const reportPath = join(outDir, "review.md");
  writeFileSync(reportPath, md);
  writeFileSync(join(outDir, "review.json"), JSON.stringify({ ...result, screens: screens.map((s) => ({ ...s, file: relative(outDir, s.file) })) }, null, 2) + "\n");

  if (opts.json) console.log(JSON.stringify({ ...result, reportPath }, null, 2));
  else {
    if (crit) console.log(`\n${pc.bold(crit.verdict === "ship" ? "Ready to ship." : crit.verdict === "polish" ? "Needs polish." : "Needs fixes.")} ${crit.summary}`);
    else if (critiqueNote) console.log(`\n${pc.dim(critiqueNote)}`);
    for (const i of crit?.issues ?? []) console.log(`${i.severity === "high" ? pc.red("●") : i.severity === "medium" ? pc.yellow("●") : pc.dim("●")} ${i.screen}, ${i.area}: ${i.problem} ${pc.dim(`Fix: ${i.fix}`)}`);
    for (const m of measured) console.log(`${m.severity === "error" ? pc.red("✗") : pc.yellow("!")} ${pc.dim(m.rule.padEnd(12))} ${m.message} ${pc.dim(m.where[0] ?? "")}`);
    console.log(`\n${errors} errors, ${warnings} warnings. Report: ${relative(process.cwd(), reportPath)}`);
  }

  if (opts.comment) await commentOnPr(md);
  if (opts.failOn === "error" && errors) process.exitCode = 1;
  if (opts.failOn === "warn" && errors + warnings) process.exitCode = 1;
  return { ...result, reportPath };
}

/** Post the report on the pull request, updating the previous review instead of adding another. */
export async function commentOnPr(body: string) {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!eventPath || !token || !repo || !existsSync(eventPath)) {
    console.log(pc.dim("--comment works in GitHub Actions on pull requests (needs GITHUB_TOKEN). Skipped."));
    return;
  }
  const event = JSON.parse(readFileSync(eventPath, "utf8")) as { pull_request?: { number: number }; number?: number };
  const number = event.pull_request?.number ?? event.number;
  if (!number) {
    console.log(pc.dim("Not a pull request event; skipped the comment."));
    return;
  }
  const api = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28" };
  const list = await fetch(`${api}/repos/${repo}/issues/${number}/comments?per_page=100`, { headers });
  const existing = list.ok ? ((await list.json()) as { id: number; body?: string }[]).find((c) => c.body?.includes(REVIEW_MARKER)) : undefined;
  const res = existing
    ? await fetch(`${api}/repos/${repo}/issues/comments/${existing.id}`, { method: "PATCH", headers, body: JSON.stringify({ body }) })
    : await fetch(`${api}/repos/${repo}/issues/${number}/comments`, { method: "POST", headers, body: JSON.stringify({ body }) });
  console.log(res.ok ? `${pc.green("✓")} ${existing ? "Updated" : "Posted"} the review on #${number}` : `${pc.yellow("!")} Couldn't comment on #${number} (${res.status}).`);
}

export const REVIEW_WORKFLOW = `name: design-review
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Guardrails
        run: npx auto-design check
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - name: Start the app
        run: |
          npm start &
          for i in $(seq 1 60); do curl -sf http://localhost:3000 > /dev/null && break; sleep 2; done
      - name: Design review
        run: npx auto-design review http://localhost:3000/ --comment
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: \${{ github.token }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: design-review
          path: .auto-design/review
`;

export function initReviewCi(cwd: string): string {
  const path = join(resolve(cwd), ".github/workflows/design-review.yml");
  if (existsSync(path)) throw new Error(`${relative(process.cwd(), path)} already exists.`);
  mkdirSync(join(resolve(cwd), ".github/workflows"), { recursive: true });
  writeFileSync(path, REVIEW_WORKFLOW);
  return path;
}
