#!/usr/bin/env node
import { cac } from "cac";
import pc from "picocolors";
import { presets } from "@auto-design/presets";
import { formatError, readVersion, runBuild, runCheck, runInit } from "./commands.js";
import { runDev } from "./dev/server.js";

// Piping into `head` closes stdout early; that's not an error worth a stack trace.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const cli = cac("auto-design");

cli
  .command("init [dir]", "Create a design system repo from a preset")
  .option("--preset <name>", "Starting preset", { default: "quiet" })
  .action(async (dir: string | undefined, opts: { preset: string }) => {
    await runInit({ dir: dir ?? `${opts.preset}-design`, preset: opts.preset });
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
