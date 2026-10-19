#!/usr/bin/env node
import { cac } from "cac";
import pc from "picocolors";
import { presets } from "@auto-design/presets";
import { formatError, readVersion, runBuild, runCheck, runInit } from "./commands.js";
import { runDev } from "./dev/server.js";
import { runAdd } from "./add.js";

// Piping into `head` closes stdout early; that's not an error worth a stack trace.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const cli = cac("auto-design");

cli
  .command("init [dir]", "Design a system in the browser, or create one from a preset with --preset")
  .option("--preset <name>", "Skip the browser and start from a preset (quiet, editorial, glass, terminal, tactile)")
  .option("--port <port>", "Port for the onboarding app", { default: 4400 })
  .option("--no-open", "Don't open a browser")
  .action(async (dir: string | undefined, opts: { preset?: string; port: number; open: boolean }) => {
    if (opts.preset || !process.stdout.isTTY && !process.env.AUTO_DESIGN_FORCE_UI) {
      const preset = opts.preset ?? "quiet";
      await runInit({ dir: dir ?? `${preset}-design`, preset });
      return;
    }
    const { runOnboard } = await import("./onboard/server.js");
    await runOnboard({ dir, port: Number(opts.port), open: opts.open });
  });

cli
  .command("build", "Compile design.config.ts into tokens, CSS, registry, rules, DESIGN.md and the design site")
  .option("--cwd <dir>", "Design system repo", { default: "." })
  .option("--config <file>", "Config file", { default: "design.config.ts" })
  .option("--no-site", "Skip the design site in public/")
  .action(async (opts: { cwd: string; config: string; site: boolean }) => {
    await runBuild({ cwd: opts.cwd, config: opts.config, site: opts.site });
  });

cli
  .command("serve", "Preview the design site and registry from public/ on this machine")
  .option("--cwd <dir>", "Design system repo", { default: "." })
  .option("--port <port>", "Port", { default: 4300 })
  .action(async (opts: { cwd: string; port: number }) => {
    const { runServe } = await import("./serve.js");
    await runServe({ cwd: opts.cwd, port: Number(opts.port) });
  });

cli
  .command("check [...paths]", "Check files against the system's guardrails")
  .option("--cwd <dir>", "Project root", { default: "." })
  .option("--json", "Machine-readable output for agents and CI")
  .action(async (paths: string[], opts: { cwd: string; json?: boolean }) => {
    const result = await runCheck({ cwd: opts.cwd, patterns: paths, json: !!opts.json });
    process.exitCode = result.errors ? 1 : 0;
  });

cli
  .command("dev", "Open the studio: pick colors visually, preview live, and keep apps in sync")
  .option("--cwd <dir>", "Design system repo", { default: "." })
  .option("--app <dir>", "An app to keep in sync (repeatable)")
  .option("--port <port>", "Port for the studio", { default: 4400 })
  .option("--no-open", "Don't open a browser")
  .action(async (opts: { cwd: string; app?: string | string[]; port: number; open: boolean }) => {
    const apps = opts.app === undefined ? [] : Array.isArray(opts.app) ? opts.app : [opts.app];
    await runDev({ cwd: opts.cwd, apps, port: Number(opts.port), open: opts.open });
  });

cli
  .command("add <system>", "Install a design system into an app (a system folder, or a hosted /r/ URL)")
  .option("--cwd <dir>", "The app", { default: "." })
  .option("--components <names>", "Comma-separated components to copy in, or 'all'", { default: "" })
  .option("--no-install", "Print the dependency install command instead of running it")
  .option("--no-mcp", "Don't register the MCP server in .mcp.json")
  .action(async (system: string, opts: { cwd: string; components: string; install: boolean; mcp: boolean }) => {
    const components = String(opts.components || "").split(",").map((s) => s.trim()).filter(Boolean);
    await runAdd({ source: system, cwd: opts.cwd, components, install: opts.install, mcp: opts.mcp });
  });

cli
  .command("mcp", "Run the MCP server: rules, tokens, components and checks as tools for coding agents (stdio)")
  .option("--cwd <dir>", "Project root: a system repo or an app that installed one", { default: "." })
  .action(async (opts: { cwd: string }) => {
    const { runMcp } = await import("./mcp/server.js");
    await runMcp({ cwd: opts.cwd });
  });

cli
  .command("message [...text]", "Check an iMessage, SMS or chat message against the system's voice and texting rules")
  .option("--cwd <dir>", "Project root", { default: "." })
  .option("--channel <channel>", "sms, imessage, rcs or chat", { default: "sms" })
  .option("--kind <kind>", "transactional, marketing or conversational", { default: "transactional" })
  .option("--first", "The first message in a thread (must name the sender)")
  .option("--json", "Machine-readable output")
  .action(async (text: string[], opts: { cwd: string; channel: string; kind: string; first?: boolean; json?: boolean }) => {
    const { runMessage } = await import("./agents.js");
    const report = await runMessage({ text: text.join(" "), cwd: opts.cwd, channel: opts.channel, kind: opts.kind, first: !!opts.first, json: !!opts.json });
    process.exitCode = report.ok ? 0 : 1;
  });

cli
  .command("card", "Draw an image card in the system's style, for texts, link previews and posts")
  .option("--cwd <dir>", "Project root", { default: "." })
  .option("--title <text>", "The one thing the card says")
  .option("--body <text>", "A sentence of context")
  .option("--metric <text>", "A number to lead with, like 92%")
  .option("--metric-label <text>", "What the number is")
  .option("--label <text>", "A short label above the title")
  .option("--footer <text>", "Bottom right, usually your domain")
  .option("--size <size>", "card (1200×800), og (1200×630) or square (1080×1080)", { default: "card" })
  .option("--mode <mode>", "light or dark")
  .option("--out <file>", "Output .png, .jpg or .svg (PNG needs Playwright)")
  .action(async (opts: { cwd: string; title?: string; body?: string; metric?: string; metricLabel?: string; label?: string; footer?: string; size: string; mode?: string; out?: string }) => {
    if (!opts.title) throw new Error("Pass --title.");
    const { runCard } = await import("./agents.js");
    await runCard({ ...opts, title: opts.title });
  });

cli
  .command("review [...targets]", "Open the app in a browser and review what it draws: measured checks, plus a design critique with a model key")
  .option("--cwd <dir>", "The app (where auto-design.json is)", { default: "." })
  .option("--base <url>", "Base URL for paths like /pricing", { default: "http://localhost:3000" })
  .option("--widths <list>", "Viewport widths", { default: "1280,390" })
  .option("--modes <list>", "light, dark or both", { default: "light,dark" })
  .option("--out <dir>", "Where screenshots and the report go", { default: ".auto-design/review" })
  .option("--no-model", "Skip the design critique")
  .option("--comment", "Post the report on the pull request (GitHub Actions)")
  .option("--fail-on <level>", "error, warn or never", { default: "error" })
  .option("--json", "Machine-readable output")
  .option("--init-ci", "Write a GitHub workflow that reviews every pull request")
  .action(async (targets: string[], opts: { cwd: string; base: string; widths: string; modes: string; out: string; model: boolean; comment?: boolean; failOn: string; json?: boolean; initCi?: boolean }) => {
    const review = await import("./review/review.js");
    if (opts.initCi) {
      const path = review.initReviewCi(opts.cwd);
      console.log(`${pc.green("✓")} Wrote ${path}. Add playwright as a dev dependency and ANTHROPIC_API_KEY as a repository secret.`);
      return;
    }
    const widths = String(opts.widths).split(",").map((w) => parseInt(w, 10)).filter((w) => w >= 240 && w <= 3840);
    const modes = String(opts.modes).split(",").map((m) => m.trim()).filter((m): m is "light" | "dark" => m === "light" || m === "dark");
    await review.runReview({
      targets: targets.map(String),
      cwd: opts.cwd,
      base: opts.base,
      widths: widths.length ? widths : [1280, 390],
      modes: modes.length ? modes : ["light", "dark"],
      out: opts.out,
      model: opts.model,
      json: !!opts.json,
      comment: !!opts.comment,
      failOn: (["error", "warn", "never"].includes(opts.failOn) ? opts.failOn : "error") as "error" | "warn" | "never",
    });
  });

cli.command("presets", "List starter presets").action(() => {
  for (const [name, p] of Object.entries(presets)) console.log(`${pc.bold(name.padEnd(10))} ${p.description ?? ""}`);
});

cli.help();
cli.version(readVersion());

async function main() {
  try {
    cli.parse(process.argv, { run: false });
    if (!cli.matchedCommand && !process.argv.slice(2).some((a) => a === "-h" || a === "--help" || a === "-v" || a === "--version")) {
      cli.outputHelp();
      return;
    }
    await cli.runMatchedCommand();
  } catch (err) {
    console.error(`${pc.red("✗")} ${formatError(err)}`);
    process.exitCode = 1;
  }
}

void main();
