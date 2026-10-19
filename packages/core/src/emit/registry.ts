import type { DesignSystem } from "../system.js";
import { componentSources } from "./components.js";
import { emitCss } from "./css.js";
import { emitDesignMd } from "./design-md.js";
import { buildGuardrails } from "./guardrails.js";

/**
 * shadcn registry output. `public/r/*.json` are self-contained items that
 * `npx shadcn add <url>` installs directly; `registry.json` is the source
 * manifest, so `npx shadcn build` can regenerate them too.
 */

const ITEM_SCHEMA = "https://ui.shadcn.com/schema/registry-item.json";
const REGISTRY_SCHEMA = "https://ui.shadcn.com/schema/registry.json";

type RegistryFile = { path: string; type: string; target?: string; content?: string };
type RegistryItem = {
  $schema?: string;
  name: string;
  type: string;
  title: string;
  description: string;
  dependencies?: string[];
  files?: RegistryFile[];
  cssVars?: { theme?: Record<string, string>; light?: Record<string, string>; dark?: Record<string, string> };
  css?: Record<string, unknown>;
  docs?: string;
  meta?: Record<string, unknown>;
};

function baseItem(s: DesignSystem): RegistryItem {
  const fonts = [s.type.fonts.sans, s.type.fonts.mono, s.type.fonts.display]
    .map((f) => f?.package)
    .filter((p): p is string => !!p);

  return {
    $schema: ITEM_SCHEMA,
    name: "base",
    type: "registry:base",
    title: `${s.config.displayName} base`,
    description: `${s.config.displayName}: tokens, locked Tailwind theme, DESIGN.md for agents and the guardrail config.`,
    dependencies: [...fonts, "class-variance-authority", "clsx", "tailwind-merge"],
    files: [
      // Lands next to app/globals.css. The lock only works as its own file imported
      // straight after Tailwind, so the theme reset runs before any definitions.
      { path: "css/auto-design.css", type: "registry:file", target: "app/auto-design.css", content: emitCss(s) },
      { path: "DESIGN.md", type: "registry:file", target: "DESIGN.md", content: emitDesignMd(s) },
      {
        path: "rules/guardrails.json",
        type: "registry:file",
        target: "auto-design.json",
        content: JSON.stringify(buildGuardrails(s), null, 2) + "\n",
      },
    ],
    css: { '@import "./auto-design.css"': {} },
    docs: [
      `Import the fonts once in your root layout: ${fonts.map((f) => `import "${f}";`).join(" ")}`,
      "Remove any :root/.dark color variables and @theme keys left in your CSS from a template; `npx auto-design check` lists them.",
      "If your Tailwind entry is not app/globals.css, move app/auto-design.css next to it.",
    ].join("\n"),
  };
}

export function emitRegistry(s: DesignSystem): Record<string, string> {
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  const files: Record<string, string> = {};
  const base = baseItem(s);
  const items: RegistryItem[] = [base];

  for (const c of componentSources(s)) {
    const isLib = c.type === "registry:lib";
    // Custom components stay where the team wrote them; the build only reads them.
    const source = c.custom && c.path ? c.path : `registry/ui/${c.file}`;
    if (!isLib && !c.custom) files[source] = c.content;
    for (const l of c.lib ?? []) files[`registry/lib/${l.file}`] = l.content;
    items.push({
      $schema: ITEM_SCHEMA,
      name: c.name,
      type: isLib ? "registry:lib" : "registry:ui",
      title: c.title,
      description: c.description,
      dependencies: c.dependencies,
      files: [
        ...(isLib ? [] : [{ path: source, type: "registry:ui", content: c.content }]),
        ...(c.lib ?? []).map((l) => ({ path: `registry/lib/${l.file}`, type: "registry:lib", content: l.content })),
      ],
      // shadcn would resolve bare names against its own registry, so in-system
      // dependencies travel in meta; `auto-design add` installs them.
      ...(c.requires?.length ? { meta: { requires: c.requires } } : {}),
    });
  }

  for (const item of items) files[`public/r/${item.name}.json`] = json(item);

  // A hosted index of every item, so tools and agents can list what's installable.
  files["public/r/registry.json"] = json({
    $schema: REGISTRY_SCHEMA,
    name: s.config.name,
    homepage: "",
    items: items.map((item) => ({ name: item.name, type: item.type, title: item.title, description: item.description })),
  });

  // The source manifest: same items, file contents left on disk.
  files["registry.json"] = json({
    $schema: REGISTRY_SCHEMA,
    name: s.config.name,
    homepage: "",
    items: items.map(({ $schema: _s, ...item }) => ({
      ...item,
      files: item.files?.map(({ content: _c, ...f }) => f),
    })),
  });
  return files;
}
