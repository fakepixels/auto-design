// auto-design's own design system, made the way anyone makes one: through onboarding.
//   npx tsx scripts/brand.mts
//
// It runs the real onboarding server (no model), makes auto-design's choices through its API, publishes
// the system to a scratch folder (no GitHub, no hosting) and copies it into brand/. The choices follow the
// onboarding's own look: ink on near-black, hairlines, soft corners, the light pill as the one action.
// The landing page (landing/) installs this system with `auto-design add`.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runOnboard } from "../packages/cli/src/onboard/server.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "brand");
const SCRATCH = path.join(os.tmpdir(), "auto-design-brand");

/** auto-design's choices. Change them here and re-run; brand/ is rewritten from them. */
export const BRAND = {
  product: {
    name: "auto-design",
    description: "Turns a few taste choices into a design system repo with hard guardrails, so agents never go off-brand.",
  },
  kind: "devtool",
  // On top of the developer-tool direction: the onboarding's own look.
  patch: {
    brand: "oklch(0.97 0.003 265)", // Paper: the light pill on near-black, flipping to ink in light mode, like onboarding
    neutral: "cool",
    texture: "minimal",
    pairing: "inter",
    radius: 12,
    density: "comfortable",
    motion: "subtle",
    defaultMode: "dark",
    energy: 0.3,
    warmth: 0.25,
    novelty: 0.35,
    tone: "Plain and exact. Lead with what you get, then the one command. No exclamation marks.",
  },
  surfaces: ["marketing", "web-app", "code"],
};

type Json = Record<string, any>;

async function main() {
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });
  delete process.env.AUTO_DESIGN_MOCK_MODEL;

  const cwd = process.cwd();
  process.chdir(SCRATCH);
  const dir = path.join(SCRATCH, "auto-design-design");
  const { server, port } = await runOnboard({ port: 4720, open: false, dir });
  process.chdir(cwd);
  const api = async (p: string, body?: Json): Promise<any> => {
    const r = await fetch(`http://localhost:${port}${p}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(`${p}: ${j.error ?? r.status}`);
    return j;
  };

  await api("/api/product", { ...BRAND.product, url: "" });
  await api("/api/kind", { kind: BRAND.kind });
  await api("/api/choose", { patch: BRAND.patch, label: "auto-design's own look" });
  await api("/api/surfaces", { surfaces: BRAND.surfaces });
  const pub = await api("/api/publish", { dir, displayName: BRAND.product.name, github: "none", hosting: "later" });
  for (const s of pub.steps) console.log(`  ${s.ok ? "✓" : "✗"} ${s.step}: ${s.detail}`);
  server.close();

  const made: string = path.isAbsolute(pub.relDir) ? pub.relDir : path.join(SCRATCH, pub.relDir);
  if (!existsSync(path.join(made, "design.config.ts"))) throw new Error(`Publishing didn't write a system to ${made}.`);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(made)) {
    // Its own CI workflow only runs at a repo's root, and this one lives inside auto-design's.
    if (f === ".git" || f === "node_modules" || f === ".github") continue;
    cpSync(path.join(made, f), path.join(OUT, f), { recursive: true });
  }
  console.log(`  wrote ${path.relative(ROOT, OUT)}/`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
