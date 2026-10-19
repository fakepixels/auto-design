import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { findGuardrails, loadGuardrails, type Guardrails } from "@auto-design/check";
import {
  agentTheme,
  buildGuardrails,
  buildSystem,
  componentSources,
  emitDesignMd,
  isAgentTheme,
  type AgentTheme,
  type DesignSystem,
} from "@auto-design/core";
import { listComponents, loadItem } from "../add.js";
import { CONFIG_FILE, loadConfig } from "../commands.js";
import { attachCustom, loadCustom } from "../custom.js";

/**
 * What the agent tools know about the design system in the current folder.
 * In a system repo that's everything, built from design.config.ts. In an app
 * that installed the system, it's what `auto-design add` left behind:
 * auto-design.json (rules, theme and where the system came from), DESIGN.md
 * and the installed components.
 */
export interface Context {
  kind: "system" | "app";
  root: string;
  guardrails: Guardrails & { theme?: unknown; product?: string; surfaces?: string[]; registry?: string };
  designMd: string;
  theme: AgentTheme | null;
  system: DesignSystem | null;
  components(): Promise<{ name: string; title?: string; description?: string; installed?: boolean }[]>;
  component(name: string): Promise<{ name: string; files: { path: string; content: string }[] } | null>;
}

function findUp(from: string, file: string): string | null {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, file))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Where an app keeps its shadcn-style components. */
function uiDir(app: string): string | null {
  for (const p of ["components/ui", "src/components/ui", "app/components/ui"]) {
    if (existsSync(join(app, p))) return join(app, p);
  }
  return null;
}

let cache: { key: string; ctx: Context } | null = null;

export async function loadContext(cwd: string): Promise<Context> {
  const systemRoot = findUp(cwd, CONFIG_FILE);
  const guardPath = findGuardrails(cwd);
  // The nearest of the two wins: an app inside a monorepo next to its system uses its own install.
  const appRoot = guardPath && basename(guardPath) === "auto-design.json" ? dirname(guardPath) : null;
  const useSystem = systemRoot && (!appRoot || systemRoot.length >= appRoot.length);

  if (useSystem) {
    const configPath = join(systemRoot, CONFIG_FILE);
    const componentsDir = join(systemRoot, "components");
    const stamp = existsSync(componentsDir) ? readdirSync(componentsDir).map((f) => `${f}@${statSync(join(componentsDir, f)).mtimeMs}`).join(",") : "";
    const key = `system:${configPath}:${statSync(configPath).mtimeMs}:${stamp}`;
    if (cache?.key === key) return cache.ctx;
    // The repo's own components are part of the system agents see.
    const s = attachCustom(buildSystem(await loadConfig(systemRoot)), loadCustom(systemRoot));
    const sources = componentSources(s);
    const ctx: Context = {
      kind: "system",
      root: systemRoot,
      guardrails: buildGuardrails(s),
      designMd: emitDesignMd(s),
      theme: agentTheme(s),
      system: s,
      components: async () => sources.map((c) => ({ name: c.name, title: c.title, description: c.description })),
      component: async (name) => {
        const c = sources.find((x) => x.name === name);
        if (!c) return null;
        return {
          name,
          files: [
            ...(c.content ? [{ path: `components/ui/${c.file}`, content: c.content }] : []),
            ...(c.lib ?? []).map((l) => ({ path: `lib/${l.file}`, content: l.content })),
          ],
        };
      },
    };
    cache = { key, ctx };
    return ctx;
  }

  if (appRoot && guardPath) {
    const key = `app:${guardPath}:${statSync(guardPath).mtimeMs}`;
    if (cache?.key === key) return cache.ctx;
    const guardrails = loadGuardrails(guardPath) as Context["guardrails"];
    const designPath = join(appRoot, "DESIGN.md");
    const source = guardrails.registry ? (/^https?:\/\//.test(guardrails.registry) || isAbsolute(guardrails.registry) ? guardrails.registry : resolve(appRoot, guardrails.registry)) : null;
    const ui = uiDir(appRoot);
    const installed = () => (ui ? readdirSync(ui).filter((f) => /\.(tsx|jsx)$/.test(f)).map((f) => f.replace(/\.(tsx|jsx)$/, "")) : []);
    const ctx: Context = {
      kind: "app",
      root: appRoot,
      guardrails,
      designMd: existsSync(designPath) ? readFileSync(designPath, "utf8") : "",
      theme: isAgentTheme(guardrails.theme) ? guardrails.theme : null,
      system: null,
      components: async () => {
        const have = new Set(installed());
        let names: { name: string; title?: string; description?: string }[] = [];
        if (source) {
          try {
            names = (await listComponents(source)).map((name) => ({ name }));
          } catch {
            names = [];
          }
        }
        if (!names.length) names = [...have].map((name) => ({ name }));
        return names.map((n) => ({ ...n, installed: have.has(n.name) }));
      },
      component: async (name) => {
        const local = ui && ["tsx", "jsx"].map((e) => join(ui, `${name}.${e}`)).find(existsSync);
        if (local) return { name, files: [{ path: local.slice(appRoot.length + 1), content: readFileSync(local, "utf8") }] };
        if (!source) return null;
        try {
          const item = await loadItem(source, name);
          return { name, files: (item.files ?? []).filter((f) => f.content).map((f) => ({ path: f.path, content: f.content! })) };
        } catch {
          return null;
        }
      },
    };
    cache = { key, ctx };
    return ctx;
  }

  throw new Error(
    `No design system found from ${cwd}. Run this in a system repo (with ${CONFIG_FILE}) or in an app where \`npx auto-design add\` installed one (with auto-design.json).`,
  );
}

/** Split DESIGN.md into its ## and ### sections, by heading. */
export function sections(md: string): { heading: string; level: number; body: string }[] {
  const out: { heading: string; level: number; body: string }[] = [];
  const lines = md.split("\n");
  let current: { heading: string; level: number; lines: string[] } | null = null;
  for (const line of lines) {
    const m = /^(#{2,3})\s+(.*)$/.exec(line);
    if (m) {
      if (current) out.push({ heading: current.heading, level: current.level, body: current.lines.join("\n").trim() });
      current = { heading: m[2]!.trim(), level: m[1]!.length, lines: [line] };
    } else current?.lines.push(line);
  }
  if (current) out.push({ heading: current.heading, level: current.level, body: current.lines.join("\n").trim() });
  return out;
}

/** One section of DESIGN.md by a loose name ("color", "chat", "iMessage"), including its subsections. */
export function section(md: string, name: string): string | null {
  const all = sections(md);
  const q = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const words = q.split(" ").filter(Boolean);
  const aliases: Record<string, string[]> = {
    messaging: ["imessage", "sms"],
    "mcp apps": ["chatgpt", "mcp"],
    "mcp-apps": ["chatgpt", "mcp"],
    "web app": ["web app"],
    typography: ["type"],
    colors: ["color"],
    spacing: ["space"],
    animation: ["motion"],
    rules: ["checking"],
  };
  const needles = [q, ...(aliases[q] ?? [])];
  const i = all.findIndex((s) => {
    const h = s.heading.toLowerCase();
    return needles.some((n) => h.includes(n)) || words.every((w) => h.includes(w));
  });
  if (i < 0) return null;
  const level = all[i]!.level;
  const parts = [all[i]!.body];
  for (let j = i + 1; j < all.length && all[j]!.level > level; j++) parts.push(all[j]!.body);
  return parts.join("\n\n");
}
