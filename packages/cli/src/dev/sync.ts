import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo", ".vercel"]);

/** Find an app's existing auto-design.css, searching a few levels deep. */
function findCss(dir: string, depth = 0): string | null {
  if (depth > 4) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  if (entries.includes("auto-design.css")) return join(dir, "auto-design.css");
  for (const e of entries) {
    if (SKIP.has(e) || e.startsWith(".")) continue;
    const full = join(dir, e);
    try {
      if (statSync(full).isDirectory()) {
        const hit = findCss(full, depth + 1);
        if (hit) return hit;
      }
    } catch {
      /* unreadable entry */
    }
  }
  return null;
}

/** Where a new app's CSS goes when it has none yet: next to the Tailwind entry. */
function defaultCssTarget(app: string): string {
  for (const d of ["app", "src/app", "src/styles", "styles", "src"]) {
    if (existsSync(join(app, d))) return join(app, d, "auto-design.css");
  }
  return join(app, "auto-design.css");
}

/**
 * Copy the compiled system into apps that consume it: the CSS, DESIGN.md and
 * the guardrails the checker reads. Returns the files written, relative to cwd.
 */
export function syncApps(systemRoot: string, apps: string[], cwd = process.cwd()): string[] {
  const written: string[] = [];
  for (const app of apps) {
    if (!existsSync(app)) continue;
    const css = findCss(app) ?? defaultCssTarget(app);
    const pairs: [string, string][] = [
      [join(systemRoot, "css/auto-design.css"), css],
      [join(systemRoot, "DESIGN.md"), join(app, "DESIGN.md")],
      [join(systemRoot, "rules/guardrails.json"), join(app, "auto-design.json")],
    ];
    for (const [from, to] of pairs) {
      if (!existsSync(from)) continue;
      copyFileSync(from, to);
      written.push(relative(cwd, to));
    }
  }
  return written;
}
