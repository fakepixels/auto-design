import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { check, type CheckResult } from "@auto-design/check";
import {
  BuildError,
  ConfigError,
  buildSystem,
  defaultCopy,
  emitAll,
  emitSite,
  type DesignConfig,
  type DesignSystem,
  type SpecimenCopy,
} from "@auto-design/core";
import { presets } from "@auto-design/presets";
import { buildSite } from "@auto-design/site";
import { attachCustom, loadCustom, type CustomContent } from "./custom.js";
import { createJiti } from "jiti";
import pc from "picocolors";

export const CONFIG_FILE = "design.config.ts";
/** Sample content for the docs site, written by onboarding; optional. */
export const COPY_FILE = "specimen.copy.json";

export function loadCopy(root: string): SpecimenCopy | undefined {
  const path = join(root, COPY_FILE);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SpecimenCopy;
  } catch {
    return undefined;
  }
}

export function writeFiles(root: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

export async function loadConfig(cwd: string, file = CONFIG_FILE): Promise<DesignConfig> {
  const path = resolve(cwd, file);
  if (!existsSync(path)) throw new Error(`No ${file} in ${cwd}. Run \`npx auto-design init\` first.`);
  const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
  const mod = await jiti.import<{ default?: DesignConfig } | DesignConfig>(path);
  return ((mod as { default?: DesignConfig }).default ?? mod) as DesignConfig;
}

/** Build the system from design.config.ts, with the repo's own components/ attached. */
export async function loadSystem(root: string, file?: string): Promise<{ config: DesignConfig; s: DesignSystem; custom: CustomContent }> {
  const config = await loadConfig(root, file);
  const custom = loadCustom(root);
  return { config, s: attachCustom(buildSystem(config), custom), custom };
}

/** The repo's GitHub page, from package.json or the git remote, for the site's source link. */
export function repoUrlOf(root: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { repository?: string | { url?: string } };
    const url = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
    if (url) return url.replace(/^git\+/, "").replace(/\.git$/, "");
  } catch {
    // no package.json
  }
  try {
    const git = readFileSync(join(root, ".git", "config"), "utf8");
    const m = git.match(/url\s*=\s*(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\s*$/m);
    if (m) return `https://github.com/${m[1]}`;
  } catch {
    // not a git repo
  }
  return undefined;
}

export const siteCopy = (s: DesignSystem, copy?: SpecimenCopy) => copy ?? defaultCopy(s.config.displayName.replace(/ design( system)?$/i, ""), s.config.description);

export interface SiteBuild {
  pages: number;
  warnings: string[];
  /** Set when the site couldn't be built; a single-page fallback was written instead. */
  error?: string;
}

/** Build the design site into public/. A broken site never fails the build: it falls back to one page and says why. */
export async function writeSite(root: string, s: DesignSystem, opts: { copy?: SpecimenCopy; custom?: CustomContent } = {}): Promise<SiteBuild> {
  const copy = siteCopy(s, opts.copy);
  const custom = opts.custom ?? loadCustom(root);
  try {
    const r = await buildSite({ root, system: s, copy, examples: custom.examples, docs: custom.docs, repoUrl: repoUrlOf(root) });
    writeFiles(join(root, "public"), r.files);
    return { pages: r.pages.length, warnings: r.warnings };
  } catch (err) {
    writeFiles(root, emitSite(s, copy));
    return { pages: 1, warnings: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export function printSite(site: SiteBuild) {
  if (site.error) console.log(`${pc.yellow("~")} The design site couldn't be built, so public/index.html is a single page for now: ${site.error}`);
  else console.log(`${pc.green("✓")} Design site: ${site.pages} pages in public/. Preview it with ${pc.cyan("npx auto-design serve")}`);
  for (const w of site.warnings) console.log(`${pc.yellow("~")} ${w}`);
}

export function configSource(config: DesignConfig): string {
  return `import type { DesignConfig } from "auto-design";

/**
 * The source of truth for this design system. Change a value here, run
 * \`npx auto-design build\`, and every token, component and agent file updates.
 * Every field is checked: values outside the system's options fail the build.
 */
export default ${JSON.stringify(config, null, 2).replace(/"([a-zA-Z_$][\w$]*)":/g, "$1:")} satisfies DesignConfig;
`;
}

export function systemReadme(s: DesignSystem): string {
  const c = s.config;
  return `# ${c.displayName}

${c.description}

A design system generated by [auto-design](https://github.com/fakepixels/auto-design). The only file
to edit by hand is \`design.config.ts\`; everything else is compiled from it.

## Use it in an app

The system is a shadcn registry. Host this repo's \`public/\` folder anywhere static, then:

\`\`\`sh
npx shadcn@latest add https://YOUR-HOST/r/base.json     # tokens, locked theme, fonts, DESIGN.md, guardrails
npx shadcn@latest add https://YOUR-HOST/r/button.json   # components, one at a time
npx auto-design check                                    # lint the app against the system
\`\`\`

Then import the fonts once in your root layout:

\`\`\`ts
${[c.type.sans, c.type.mono, c.type.display].filter((f) => f?.package).map((f) => `import "${f!.package}";`).join("\n")}
\`\`\`

## For coding agents

\`npx auto-design add\` points AGENTS.md and CLAUDE.md at DESIGN.md and registers an MCP server in the
app's \`.mcp.json\`. Agents can then ask for the rules, tokens and components, and check code and text
messages before they finish:

\`\`\`sh
npx auto-design mcp                                  # the MCP server (stdio), run by the agent
npx auto-design message "Your report is ready"       # check a text against the voice rules
npx auto-design card --title "92% on track"          # an image card for texts and link previews
npx auto-design review http://localhost:3000/        # screenshots, measured checks and a design critique
\`\`\`

## Change it

1. Edit \`design.config.ts\`.
2. Run \`npx auto-design build\`. The build fails if any color pair misses WCAG AA, and fixes what it can.
3. Open a pull request. CI rebuilds and fails if generated files are out of date.

## What's here

| Path | What it is |
| --- | --- |
| \`design.config.ts\` | The source of truth |
| \`DESIGN.md\` | Instructions every coding agent reads before writing UI |
| \`css/auto-design.css\` | One CSS file for apps that don't use the shadcn CLI |
| \`tokens/\` | W3C design tokens (2025.10 format), light and dark |
| \`rules/guardrails.json\` | What \`auto-design check\` enforces |
| \`public/\` | The design site (home, docs, live components) and the shadcn registry in \`public/r/\`, ready to host |
| \`registry/ui/\` | Component sources |
| \`components/\` | Your own components, by hand. The build adds them to the registry, DESIGN.md and the site |
| \`examples/\` | Your own live examples for the site: \`button.tsx\` replaces a preview, \`button-loading.tsx\` adds one |
| \`docs/\` | Your own pages for the site, in Markdown |
| \`build-report.json\` | Every contrast check and every value the compiler adjusted |

\`design.config.ts\`, \`components/\`, \`examples/\` and \`docs/\` are yours; everything else is generated.
Preview the site with \`npx auto-design serve\`.
`;
}

export function systemPackageJson(s: DesignSystem): string {
  return (
    JSON.stringify(
      {
        name: `${s.config.name}-design`,
        private: true,
        type: "module",
        scripts: { build: "auto-design build", check: "auto-design check" },
        devDependencies: { "auto-design": "^0.1.0" },
      },
      null,
      2,
    ) + "\n"
  );
}

export const WORKFLOW = `name: design-system
on:
  pull_request:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
      - name: Rebuild from design.config.ts
        run: npx auto-design build
      - name: Generated files must be committed
        run: git diff --exit-code -- . ':(exclude)public/_site'
      - name: Components and examples pass the guardrails
        run: npx auto-design check registry components examples
`;

export function printBuild(s: DesignSystem, written: number, root: string) {
  const r = s.report;
  const passed = r.checks.filter((c) => c.pass).length;
  console.log(`${pc.green("✓")} ${s.config.displayName}: wrote ${written} files to ${relative(process.cwd(), root) || "."}`);
  console.log(`${pc.green("✓")} ${passed}/${r.checks.length} contrast checks pass (WCAG AA)`);
  for (const f of r.fixes) {
    console.log(`${pc.yellow("~")} ${f.mode}: ${f.role} on ${f.against} was ${f.before}:1, adjusted to ${f.after}:1 (${f.from} → ${f.to})`);
  }
  for (const n of r.notes) console.log(`${pc.dim("i")} ${n}`);
}

export async function runBuild(opts: { cwd: string; config?: string; quiet?: boolean; site?: boolean }) {
  const root = resolve(opts.cwd);
  const { s, custom } = await loadSystem(root, opts.config);
  const copy = loadCopy(root);
  const files = emitAll(s, { copy });
  writeFiles(root, files);
  if (!opts.quiet) printBuild(s, Object.keys(files).length, root);
  if (opts.site !== false) {
    const site = await writeSite(root, s, { copy, custom });
    if (!opts.quiet) printSite(site);
  }
  return s;
}

export async function runInit(opts: { dir: string; preset: string }) {
  const preset = presets[opts.preset];
  if (!preset) {
    throw new Error(`Unknown preset "${opts.preset}". Available: ${Object.keys(presets).join(", ")}`);
  }
  const root = resolve(opts.dir);
  if (existsSync(join(root, CONFIG_FILE))) throw new Error(`${join(root, CONFIG_FILE)} already exists.`);
  mkdirSync(root, { recursive: true });

  const s = buildSystem(preset);
  const files: Record<string, string> = {
    [CONFIG_FILE]: configSource(preset),
    "package.json": systemPackageJson(s),
    "README.md": systemReadme(s),
    ".github/workflows/design-system.yml": WORKFLOW,
    ".gitignore": "node_modules/\n",
    ...emitAll(s),
  };
  writeFiles(root, files);
  printBuild(s, Object.keys(files).length, root);
  printSite(await writeSite(root, s));
  console.log(`\nNext: ${pc.cyan(`cd ${relative(process.cwd(), root) || "."}`)} and edit ${pc.cyan(CONFIG_FILE)}, then ${pc.cyan("npx auto-design build")}.`);
}

export function printCheck(result: CheckResult, json: boolean) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const byFile = new Map<string, CheckResult["violations"]>();
  for (const v of result.violations) byFile.set(v.file, [...(byFile.get(v.file) ?? []), v]);
  for (const [file, vs] of byFile) {
    console.log(pc.underline(file));
    for (const v of vs) {
      const tag = v.severity === "error" ? pc.red("error") : pc.yellow("warn ");
      console.log(`  ${pc.dim(`${v.line}:${v.column}`.padEnd(8))} ${tag}  ${v.message}  ${pc.dim(v.rule)}`);
    }
    console.log();
  }
  if (result.allowances.length) {
    console.log(pc.dim(`${result.allowances.length} explicit exception${result.allowances.length === 1 ? "" : "s"}:`));
    for (const a of result.allowances) console.log(pc.dim(`  ${a.file}:${a.line}  ${a.rules.join(", ")}  ${a.reason || "(no reason given)"}`));
    console.log();
  }
  const summary = `${result.files} files, ${result.errors} error${result.errors === 1 ? "" : "s"}, ${result.warnings} warning${result.warnings === 1 ? "" : "s"}`;
  console.log(result.errors ? `${pc.red("✗")} ${summary}` : `${pc.green("✓")} ${summary}`);
}

export async function runCheck(opts: { cwd: string; patterns: string[]; json: boolean }) {
  const patterns = opts.patterns.length
    ? opts.patterns.map((p) => (/[*{]/.test(p) || /\.\w+$/.test(p) ? p : `${p.replace(/\/$/, "")}/**/*.{tsx,jsx,ts,js,mjs,css}`))
    : undefined;
  const result = await check({ cwd: opts.cwd, patterns });
  printCheck(result, opts.json);
  return result;
}

export function formatError(err: unknown): string {
  if (err instanceof ConfigError || err instanceof BuildError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}
