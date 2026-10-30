import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentSource, DesignSystem, SystemImage } from "@auto-design/core";

/**
 * The parts of a system repo the team writes by hand. The build reads them and
 * never overwrites them:
 *
 * - components/<name>.tsx  components of your own, or a replacement for a generated one
 * - examples/<name>.tsx    live examples on the design site; <component>-<variant>.tsx adds a variant
 * - docs/<slug>.md         pages of your own on the design site
 * - images/                photos the system ships, listed with their credits in images/credits.json
 */
export const CUSTOM_DIRS = ["components", "examples", "docs"] as const;

export interface CustomExample {
  /** File name without extension: "button" or "button-loading". */
  name: string;
  code: string;
  path: string;
}

export interface CustomDoc {
  slug: string;
  title: string;
  description: string;
  /** Sort position in the sidebar; pages without one come after, by title. */
  order: number;
  body: string;
  path: string;
}

export interface CustomContent {
  components: ComponentSource[];
  examples: CustomExample[];
  docs: CustomDoc[];
  /** Photos in images/ that credits.json lists and that exist on disk. */
  images: SystemImage[];
}

/** The photos images/credits.json lists, keeping only files that are really there. */
export function loadImages(root: string): SystemImage[] {
  const file = join(root, "images", "credits.json");
  if (!existsSync(file)) return [];
  try {
    const list = (JSON.parse(readFileSync(file, "utf8")) as { images?: Partial<SystemImage>[] }).images ?? [];
    return list
      .filter((i): i is SystemImage => typeof i.file === "string" && /^[\w.-]+\.(jpe?g|png|webp|avif)$/i.test(i.file) && existsSync(join(root, "images", i.file)))
      .map((i) => ({ file: i.file, alt: String(i.alt ?? ""), width: Number(i.width) || null, height: Number(i.height) || null, credit: String(i.credit ?? "") }));
  } catch {
    throw new Error("images/credits.json isn't valid JSON. It lists the photos in images/ as { \"images\": [{ \"file\", \"alt\", \"credit\" }] }.");
  }
}

const NAME = /^[a-z][a-z0-9-]*$/;

function files(dir: string, ext: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => ext.test(f) && !f.startsWith("."))
    .sort();
}

/** "pricing-table" → "Pricing table" */
export function titleFromName(name: string): string {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The first JSDoc block in a file: its text, and any @title tag. */
function docComment(src: string): { text: string; title?: string } {
  const m = src.match(/\/\*\*([\s\S]*?)\*\//);
  if (!m) return { text: "" };
  const lines = (m[1] ?? "").split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trimEnd());
  let title: string | undefined;
  const body: string[] = [];
  for (const l of lines) {
    const t = l.match(/^@title\s+(.+)$/);
    if (t) title = (t[1] ?? "").trim();
    else if (!l.startsWith("@")) body.push(l);
  }
  const paragraph = body.join("\n").trim().split(/\n\s*\n/)[0] ?? "";
  // Plain text: descriptions show up in tables and page headers, where Markdown would print literally.
  return { text: paragraph.replace(/`/g, "").replace(/\s+/g, " ").trim(), title };
}

function imports(src: string): string[] {
  return [...src.matchAll(/(?:^|\n)\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)].map((m) => m[1] ?? "");
}

function packageOf(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? spec);
}

const BUILT_IN = new Set(["react", "react-dom"]);

export function readComponent(name: string, src: string, path: string): ComponentSource {
  const doc = docComment(src);
  const specs = imports(src);
  const dependencies = [...new Set(specs.filter((x) => !x.startsWith(".") && !x.startsWith("@/")).map(packageOf).filter((x) => !BUILT_IN.has(x)))];
  const requires = [...new Set(specs.map((x) => x.match(/^@\/components\/ui\/([a-z0-9-]+)$/)?.[1]).filter((x): x is string => !!x && x !== name))];
  return {
    name,
    title: doc.title ?? titleFromName(name),
    description: doc.text,
    dependencies,
    ...(requires.length ? { requires } : {}),
    file: `${name}.tsx`,
    content: src,
    custom: true,
    path,
  };
}

function frontmatter(src: string): { data: Record<string, string>; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: src };
  const data: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (kv?.[1]) data[kv[1]] = (kv[2] ?? "").trim().replace(/^["']|["']$/g, "");
  }
  return { data, body: src.slice(m[0].length) };
}

export function readDoc(slug: string, src: string, path: string): CustomDoc {
  const { data, body } = frontmatter(src);
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const order = Number(data.order);
  return {
    slug,
    title: data.title || heading || titleFromName(slug),
    description: data.description || "",
    order: Number.isFinite(order) ? order : Number.POSITIVE_INFINITY,
    // The page draws its own title, so a leading h1 that repeats it is dropped.
    body: heading && !data.title ? body.replace(/^#\s+.+\r?\n?/m, "") : body,
    path,
  };
}

/** Read components/, examples/ and docs/ from a system repo. Bad file names fail with what to rename. */
export function loadCustom(root: string): CustomContent {
  const bad: string[] = [];
  const named = (dir: string, ext: RegExp) =>
    files(join(root, dir), ext).filter((f) => {
      const ok = NAME.test(f.replace(ext, ""));
      if (!ok) bad.push(`${dir}/${f}`);
      return ok;
    });

  const components = named("components", /\.tsx$/).map((f) => {
    const name = f.replace(/\.tsx$/, "");
    return readComponent(name, readFileSync(join(root, "components", f), "utf8"), `components/${f}`);
  });
  const examples = named("examples", /\.tsx$/).map((f) => ({
    name: f.replace(/\.tsx$/, ""),
    code: readFileSync(join(root, "examples", f), "utf8"),
    path: `examples/${f}`,
  }));
  const docs = named("docs", /\.md$/).map((f) => readDoc(f.replace(/\.md$/, ""), readFileSync(join(root, "docs", f), "utf8"), `docs/${f}`));

  if (bad.length) {
    throw new Error(`Rename ${bad.join(", ")} to lowercase words joined by dashes, like pricing-table.tsx. The file name becomes the component or page name.`);
  }
  return { components, examples, docs, images: loadImages(root) };
}

/** Put the repo's own components into the system, so the registry, DESIGN.md and agents see them. */
export function attachCustom(s: DesignSystem, custom: CustomContent): DesignSystem {
  s.extraComponents = custom.components;
  s.images = custom.images;
  return s;
}
