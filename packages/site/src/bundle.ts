import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ComponentSource } from "@auto-design/core";
import { build, type Plugin } from "esbuild";

/**
 * Turns component and example sources into rendered HTML and a hydration
 * bundle. Examples are prerendered in Node with the real components, then the
 * interactive ones are hydrated in the browser as islands.
 */

export interface ExampleModule {
  name: string;
  code: string;
}

export interface RenderedExamples {
  /** Prerendered HTML by example name. */
  html: Record<string, string>;
  /** Examples that render on the server only (they use an async component like the code block). */
  staticOnly: Set<string>;
  /** Examples that failed to build or render, with the reason. */
  errors: Record<string, string>;
  /** The browser bundle that hydrates interactive examples, or "" when none are interactive. */
  client: string;
}

const require = createRequire(import.meta.url);

const UTILS = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

/** Examples that use a server-only (async) component can't hydrate; they stay as prerendered HTML. */
const SERVER_ONLY = /@\/components\/ui\/code-block\b/;

/** node_modules folders to resolve packages from: the system repo first, then auto-design's own. */
function nodePaths(root: string): string[] {
  const out = [join(root, "node_modules")];
  for (const pkg of ["react", "radix-ui", "sonner", "shiki", "clsx"]) {
    try {
      let dir = dirname(require.resolve(`${pkg}/package.json`));
      while (dir !== dirname(dir) && !dir.endsWith("node_modules")) dir = dirname(dir);
      if (dir.endsWith("node_modules") && !out.includes(dir)) out.push(dir);
    } catch {
      // Not installed alongside auto-design; the system repo may have it.
    }
  }
  return out;
}

/** One copy of React for everything, so hooks in Radix and in examples share it. */
function singleReact(): Plugin {
  return {
    name: "single-react",
    setup(b) {
      b.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, (args) => {
        try {
          return { path: require.resolve(args.path) };
        } catch {
          return undefined;
        }
      });
    },
  };
}

/** Load shiki from node_modules at render time instead of bundling every grammar. */
function externalShiki(): Plugin {
  return {
    name: "external-shiki",
    setup(b) {
      b.onResolve({ filter: /^(shiki|@shikijs\/.*)$/ }, (args) => {
        for (const from of [args.resolveDir, undefined]) {
          try {
            const path = from ? createRequire(join(from, "x.js")).resolve(args.path) : require.resolve(args.path);
            return { path: pathToFileURL(path).href, external: true };
          } catch {
            // try the next location
          }
        }
        return undefined;
      });
    },
  };
}

function writeWorkspace(dir: string, components: ComponentSource[], examples: ExampleModule[]) {
  const put = (path: string, content: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  put("tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] }, jsx: "react-jsx" } }));
  put("lib/utils.ts", UTILS);
  for (const c of components) {
    if (c.content) put(`components/ui/${c.file}`, c.content);
    for (const l of c.lib ?? []) put(`lib/${l.file}`, l.content);
  }
  for (const e of examples) put(`examples/${e.name}.tsx`, e.code);
}

const ident = (i: number) => `E${i}`;

function serverEntry(examples: ExampleModule[]): string {
  return `import * as React from "react";
import { prerender } from "react-dom/static";
${examples.map((e, i) => `import ${ident(i)} from "./examples/${e.name}";`).join("\n")}

const examples = { ${examples.map((e, i) => `${JSON.stringify(e.name)}: ${ident(i)}`).join(", ")} };

export async function render(name) {
  const { prelude } = await prerender(React.createElement(examples[name]));
  const reader = prelude.getReader();
  const decoder = new TextDecoder();
  let html = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  return html + decoder.decode();
}
`;
}

function clientEntry(examples: ExampleModule[]): string {
  return `import * as React from "react";
import { hydrateRoot } from "react-dom/client";
${examples.map((e, i) => `import ${ident(i)} from "./examples/${e.name}";`).join("\n")}

const examples = { ${examples.map((e, i) => `${JSON.stringify(e.name)}: ${ident(i)}`).join(", ")} };

for (const el of document.querySelectorAll("[data-preview]")) {
  const C = examples[el.getAttribute("data-preview")];
  if (C && !el.hasAttribute("data-static")) hydrateRoot(el, React.createElement(C));
}
`;
}

/** Bundled CommonJS (React's server build) requires Node built-ins; give the ESM bundle a require. */
const NODE_BANNER = { js: 'import { createRequire as __adRequire } from "node:module"; const require = __adRequire(import.meta.url);' };

const shared = (dir: string, root: string) =>
  ({
    absWorkingDir: dir,
    bundle: true,
    write: false,
    jsx: "automatic",
    loader: { ".tsx": "tsx", ".ts": "ts" },
    nodePaths: nodePaths(root),
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
    legalComments: "none",
    tsconfig: join(dir, "tsconfig.json"),
  }) as const;

/** Build one example on its own, to find which example broke a combined build. */
async function findBroken(dir: string, root: string, examples: ExampleModule[]): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};
  for (const e of examples) {
    try {
      await build({ ...shared(dir, root), entryPoints: [join(dir, `examples/${e.name}.tsx`)], platform: "node", format: "esm", banner: NODE_BANNER, plugins: [singleReact(), externalShiki()] });
    } catch (err) {
      errors[e.name] = firstError(err);
    }
  }
  return errors;
}

function firstError(err: unknown): string {
  const e = err as { errors?: { text: string; location?: { file: string; line: number } | null }[]; message?: string };
  const first = e.errors?.[0];
  if (first) return first.location ? `${first.text} (${first.location.file.split("/").slice(-2).join("/")}:${first.location.line})` : first.text;
  return e.message ?? String(err);
}

export async function renderExamples(root: string, components: ComponentSource[], examples: ExampleModule[]): Promise<RenderedExamples> {
  const dir = mkdtempSync(join(tmpdir(), "auto-design-site-"));
  const out: RenderedExamples = { html: {}, staticOnly: new Set(), errors: {}, client: "" };
  try {
    writeWorkspace(dir, components, examples);

    // A broken example (a custom one that imports something missing, say) shouldn't take the site down.
    let usable = examples;
    const tryServer = async (list: ExampleModule[]) => {
      writeFileSync(join(dir, "server.tsx"), serverEntry(list));
      return build({ ...shared(dir, root), entryPoints: [join(dir, "server.tsx")], platform: "node", format: "esm", banner: NODE_BANNER, plugins: [singleReact(), externalShiki()] });
    };
    let server;
    try {
      server = await tryServer(usable);
    } catch {
      Object.assign(out.errors, await findBroken(dir, root, usable));
      usable = usable.filter((e) => !out.errors[e.name]);
      server = await tryServer(usable);
    }
    const file = join(dir, "server.mjs");
    writeFileSync(file, server.outputFiles[0]!.text);
    const mod = (await import(pathToFileURL(file).href)) as { render(name: string): Promise<string> };
    for (const e of usable) {
      try {
        out.html[e.name] = await mod.render(e.name);
      } catch (err) {
        out.errors[e.name] = err instanceof Error ? err.message : String(err);
      }
      if (SERVER_ONLY.test(e.code)) out.staticOnly.add(e.name);
    }

    const interactive = usable.filter((e) => !out.staticOnly.has(e.name) && out.html[e.name] !== undefined);
    if (interactive.length) {
      writeFileSync(join(dir, "client.tsx"), clientEntry(interactive));
      const client = await build({
        ...shared(dir, root),
        entryPoints: [join(dir, "client.tsx")],
        platform: "browser",
        format: "esm",
        target: "es2020",
        minify: true,
        plugins: [singleReact()],
      });
      out.client = client.outputFiles[0]!.text;
    }
    return out;
  } finally {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}
