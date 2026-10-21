// Look up Fontsource packages on npm and read each one's metadata.json from its tarball.
// Adds new ids to meta.json and keeps the ones already there:
//   python3 scripts/fonts/curate.py | node scripts/fonts/fetch.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const META = new URL("./meta.json", import.meta.url);
const ids = readFileSync(0, "utf8").split(/\s+/).filter(Boolean);
const out = existsSync(META) ? JSON.parse(readFileSync(META, "utf8")) : {};
const get = async (url) => { const r = await fetch(url); return r.ok ? r : null; };
await Promise.all(ids.map(async (id) => {
  if (out[id]) return;
  for (const scope of ["@fontsource-variable", "@fontsource"]) {
    const pkg = `${scope}/${id}`;
    const r = await get(`https://registry.npmjs.org/${pkg.replace("/", "%2f")}/latest`);
    if (!r) continue;
    const meta = await r.json();
    try {
      const tgz = Buffer.from(await (await fetch(meta.dist.tarball)).arrayBuffer());
      const json = execFileSync("tar", ["-xzO", "package/metadata.json"], { input: tgz, maxBuffer: 1 << 26 }).toString();
      const m = JSON.parse(json);
      out[id] = { package: pkg, version: meta.version, family: m.family, weights: m.weights, styles: m.styles, variable: m.variable || null, category: m.category, license: m.license?.type ?? meta.license, subsets: m.subsets };
    } catch (e) {
      out[id] = { package: pkg, error: String(e).slice(0, 120) };
    }
    return;
  }
  out[id] = { missing: true };
}));
writeFileSync(META, JSON.stringify(out, null, 1));
const rows = Object.entries(out);
console.log(`${rows.length} ids, ${rows.filter(([, v]) => v.missing).length} missing, ${rows.filter(([, v]) => v.error).length} errors, ${rows.filter(([, v]) => v.license && v.license !== "OFL-1.1").length} not OFL`);
