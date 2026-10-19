import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSystem, componentSources, emitAll, emitDesignMd } from "@auto-design/core";
import { presets } from "@auto-design/presets";
import { describe, expect, it } from "vitest";
import { attachCustom, loadCustom, readComponent, readDoc, titleFromName } from "../src/custom.js";

const PRICING = `import * as React from "react";
import { cva } from "class-variance-authority";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A plan on the pricing page, with \`featured\` for the one most teams pick.
 *
 * Longer notes stay out of the description.
 * @title Pricing card
 */
export function PricingCard({ className }: { className?: string }) {
  return <div className={cn("rounded-xl border p-6", className)}><Button>Choose</Button></div>;
}
`;

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "ad-custom-"));
  mkdirSync(join(dir, "components"));
  mkdirSync(join(dir, "examples"));
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "components", "pricing-card.tsx"), PRICING);
  writeFileSync(join(dir, "examples", "pricing-card.tsx"), "export default function X() { return null; }\n");
  writeFileSync(join(dir, "docs", "brand.md"), "---\ntitle: Brand\norder: 2\n---\n\nHello.\n");
  return dir;
}

describe("custom content", () => {
  it("reads a component's title, description, dependencies and what it needs from the system", () => {
    const c = readComponent("pricing-card", PRICING, "components/pricing-card.tsx");
    expect(c.title).toBe("Pricing card");
    expect(c.description).toBe("A plan on the pricing page, with featured for the one most teams pick.");
    expect(c.dependencies).toEqual(["class-variance-authority"]);
    expect(c.requires).toEqual(["button"]);
    expect(c.custom).toBe(true);
  });

  it("titles from file names and reads doc front matter or the first heading", () => {
    expect(titleFromName("pricing-table")).toBe("Pricing table");
    const a = readDoc("brand", "---\ntitle: Our brand\ndescription: Logo and voice\norder: 1\n---\n# Ignored\nBody", "docs/brand.md");
    expect([a.title, a.description, a.order]).toEqual(["Our brand", "Logo and voice", 1]);
    const b = readDoc("voice", "# How we write\n\nPlain words.", "docs/voice.md");
    expect(b.title).toBe("How we write");
    expect(b.body).not.toMatch(/# How we write/);
    expect(b.order).toBe(Number.POSITIVE_INFINITY);
  });

  it("layers components/ over the system without overwriting the team's files", () => {
    const dir = repo();
    const custom = loadCustom(dir);
    expect(custom.examples.map((e) => e.name)).toEqual(["pricing-card"]);
    expect(custom.docs.map((d) => d.slug)).toEqual(["brand"]);
    const s = attachCustom(buildSystem(presets.quiet!), custom);
    expect(componentSources(s).some((c) => c.name === "pricing-card")).toBe(true);
    const files = emitAll(s);
    expect(files["components/pricing-card.tsx"]).toBeUndefined();
    expect(files["registry/ui/pricing-card.tsx"]).toBeUndefined();
    const item = JSON.parse(files["public/r/pricing-card.json"]!);
    expect(item.files[0].path).toBe("components/pricing-card.tsx");
    expect(item.meta.requires).toEqual(["button"]);
    expect(emitDesignMd(s)).toContain("`pricing-card`");
  });

  it("replaces a generated component with the team's own of the same name", () => {
    const dir = repo();
    writeFileSync(join(dir, "components", "button.tsx"), "/** Our button. */\nexport function Button() { return null; }\n");
    const s = attachCustom(buildSystem(presets.quiet!), loadCustom(dir));
    const button = componentSources(s).find((c) => c.name === "button")!;
    expect(button.custom).toBe(true);
    expect(button.description).toBe("Our button.");
    expect(componentSources(s).filter((c) => c.name === "button")).toHaveLength(1);
  });

  it("says which files to rename", () => {
    const dir = repo();
    writeFileSync(join(dir, "components", "PricingTable.tsx"), "");
    expect(() => loadCustom(dir)).toThrow(/Rename components\/PricingTable\.tsx/);
  });
});
