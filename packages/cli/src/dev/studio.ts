import { existsSync, readFileSync } from "node:fs";

/**
 * The studio page is a single static HTML file. In the monorepo it sits next
 * to this module; in the published build it is copied next to dist/bin.js.
 */
export function studioPage(): string {
  for (const rel of ["./studio.html", "./dev/studio.html"]) {
    const url = new URL(rel, import.meta.url);
    if (existsSync(url)) return readFileSync(url, "utf8");
  }
  throw new Error("studio.html is missing from the auto-design package");
}
