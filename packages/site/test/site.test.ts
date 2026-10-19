import { existsSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSystem, componentSources, defaultCopy, type DesignConfig } from "@auto-design/core";
import { presets } from "@auto-design/presets";
import { describe, expect, it } from "vitest";
import { buildSite, candidates, mergeExamples, renderMarkdown } from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const copy = defaultCopy("Northwind", "Project planning for agencies that bill by the hour");

/** Every relative href and src on every page points at a file the site has. */
function brokenLinks(files: Record<string, string>): string[] {
  const out: string[] = [];
  const has = (p: string) => p in files || `${p}index.html` in files || `${p}/index.html` in files || /^(DESIGN\.md|llms\.txt|r\/)/.test(p);
  for (const [path, html] of Object.entries(files)) {
    if (!path.endsWith(".html")) continue;
    const dir = posix.dirname(path);
    for (const m of html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
      const url = m[1]!;
      if (/^(https?:|mailto:|data:)/.test(url)) continue;
      const target = posix.normalize(posix.join(dir, url));
      if (!has(target.replace(/^\.\//, "").replace(/^\.$/, ""))) out.push(`${path} → ${url}`);
    }
  }
  return out;
}

describe("design site", () => {
  for (const name of ["quiet", "terminal"] as const) {
    it(`builds every page for ${name}, with live examples and no broken links`, async () => {
      const config: DesignConfig = { ...presets[name]!, surfaces: ["web-app", "marketing", "code", "chat"] };
      const s = buildSystem(config);
      const r = await buildSite({ root, system: s, copy });
      expect(r.warnings).toEqual([]);
      const ui = componentSources(s).filter((c) => c.type !== "registry:lib");
      for (const c of ui) expect(r.files[`docs/components/${c.name}/index.html`], c.name).toBeDefined();
      for (const p of ["index.html", "docs/index.html", "docs/installation/index.html", "docs/colors/index.html", "docs/typography/index.html", "docs/shape/index.html", "docs/motion/index.html", "docs/voice/index.html", "docs/agents/index.html", "docs/guardrails/index.html", "docs/components/index.html", "_site/site.css", "_site/site.js", "_site/previews.js"]) {
        expect(r.files[p], p).toBeDefined();
      }
      // Real components, prerendered: the button page holds the button's own markup.
      expect(r.files["docs/components/button/index.html"]).toMatch(/data-preview="button"[^>]*>.*data-slot="button"/s);
      // The code block can't hydrate (it's async), so it stays prerendered and out of the browser bundle.
      expect(r.files["docs/components/code-block/index.html"]).toMatch(/data-preview="code-block" data-static/);
      expect(r.files["_site/previews.js"]).not.toMatch(/codeToHtml/);
      expect(brokenLinks(r.files)).toEqual([]);
      // Classes come from the system's own theme: roles exist, Tailwind's palette doesn't.
      const css = r.files["_site/site.css"]!;
      expect(css).toContain(".bg-primary");
      expect(css).not.toMatch(/\.bg-blue-500/);
    }, 60_000);
  }

  it("builds a dark-first system that switches with the light class", async () => {
    const s = buildSystem(presets.terminal!);
    const r = await buildSite({ root, system: s, copy });
    expect(r.files["index.html"]).toMatch(/data-mode-class="light" data-default-mode="dark"/);
  }, 60_000);

  it("adds the team's examples and pages, and reports examples that don't render", async () => {
    const s = buildSystem(presets.quiet!);
    const r = await buildSite({
      root,
      system: s,
      copy,
      examples: [
        { name: "button-loading", code: `import { Button } from "@/components/ui/button";\nexport default function L() { return <Button disabled>Saving changes</Button>; }\n` },
        { name: "badge-broken", code: `import { Nope } from "@/components/ui/nope";\nexport default function B() { return <Nope />; }\n` },
        { name: "orphan", code: "export default function O() { return null; }\n" },
      ],
      docs: [{ slug: "brand", title: "Brand", description: "Logo and voice", order: 1, body: "## Logo\n\nUse it big.\n" }],
    });
    expect(r.files["docs/components/button/index.html"]).toContain("Saving changes");
    expect(r.files["docs/brand/index.html"]).toContain('id="logo"');
    expect(r.files["index.html"]).toContain("Guides");
    expect(r.warnings.some((w) => /badge-broken example didn't render/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /orphan\.tsx doesn't match a component/.test(w))).toBe(true);
    expect(r.files["docs/components/badge/index.html"]).toContain("This example didn't render");
  }, 60_000);

  it("orders main previews first and names variants from the file", () => {
    const { examples } = mergeExamples(
      [{ name: "button", component: "button", title: "Button", code: "a" }],
      [{ name: "button-loading", code: "b" }, { name: "button", code: "c" }],
      ["button", "badge"],
      { button: "Button" },
    );
    expect(examples.map((e) => [e.name, e.title, e.code])).toEqual([["button", "Button", "c"], ["button-loading", "Loading", "b"]]);
  });

  it("finds class candidates the way Tailwind's scanner does", () => {
    const c = candidates([`<div class="data-[state=checked]:bg-primary hover:bg-accent">`, `cn("px-4 py-2", ok && "text-sm")`]);
    expect(c).toEqual(expect.arrayContaining(["data-[state=checked]:bg-primary", "hover:bg-accent", "px-4", "py-2", "text-sm"]));
  });

  it("draws Markdown with the system's utilities and collects headings", () => {
    const md = renderMarkdown("## One\n\nText with `code`.\n\n### Two\n", (code) => `<pre>${code}</pre>`);
    expect(md.toc).toEqual([{ id: "one", text: "One", level: 2 }, { id: "two", text: "Two", level: 3 }]);
    expect(md.html).toContain('class="rounded-sm bg-muted');
  });
});
