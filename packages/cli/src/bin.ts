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
  .command("build", "Compile design.config.ts into tokens, CSS, registry, rules and DESIGN.md")
  .option("--cwd <dir>", "Design system repo", { default: "." })
  .option("--config <file>", "Config file", { default: "design.config.ts" })
  .action(async (opts: { cwd: string; config: string }) => {
    await runBuild({ cwd: opts.cwd, config: opts.config });
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
  .action(async (system: string, opts: { cwd: string; components: string; install: boolean }) => {
    const components = String(opts.components || "").split(",").map((s) => s.trim()).filter(Boolean);
    await runAdd({ source: system, cwd: opts.cwd, components, install: opts.install });
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
