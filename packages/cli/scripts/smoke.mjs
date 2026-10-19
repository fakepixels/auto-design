// Runs before `npm publish`: the bundled CLI must start, build a system and check it,
// without the TypeScript sources (it runs dist/bin.js directly).
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bin = new URL("../dist/bin.js", import.meta.url).pathname;
const run = (args, cwd) => execFileSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
const dir = mkdtempSync(join(tmpdir(), "auto-design-smoke-"));

const version = run(["--version"], dir).trim();
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (!version.includes(pkg.version)) throw new Error(`--version printed "${version}", expected ${pkg.version}`);
run(["init", "sys", "--preset", "glass"], dir);
for (const f of ["design.config.ts", "css/auto-design.css", "DESIGN.md", "public/index.html", "public/r/registry.json"]) {
  if (!existsSync(join(dir, "sys", f))) throw new Error(`init didn't write ${f}`);
}
run(["build", "--cwd", "sys"], dir);
run(["check", "--cwd", "sys", "registry/ui/*.tsx"], dir);
for (const f of ["onboard.html", "studio.html", "renderer.css", "renderer.js", "index.d.ts"]) {
  if (!existsSync(new URL(`../dist/${f}`, import.meta.url))) throw new Error(`dist/${f} is missing`);
}
console.log(`smoke ok: auto-design ${pkg.version}`);
