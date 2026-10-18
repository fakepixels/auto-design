import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSession,
  heuristicTexture,
  setProduct,
  setSurfaces,
  slug,
  startFrom,
  undo,
  variants,
} from "../src/onboard/session.js";
import { writeRepo, type Hosting } from "../src/onboard/publish.js";

const tmp = () => mkdtempSync(join(tmpdir(), "ad-onboard-"));

describe("onboarding session", () => {
  it("names the system after the product", () => {
    const s = createSession();
    setProduct(s, { name: "Meridian Labs", description: "Usage-based billing" });
    expect(s.config.name).toBe("meridian-labs");
    expect(s.config.displayName).toBe("Meridian Labs");
    expect(s.copy.product).toBe("Meridian Labs");
  });

  it("makes safe slugs", () => {
    expect(slug("Café Ünïcode!")).toBe("cafe-unicode");
    expect(slug("42 Things")).toBe("s42-things");
    expect(slug("!!!")).toBe("my-product");
  });

  it("draws every option of every question without errors", () => {
    const s = createSession({ name: "Meridian" });
    for (const field of ["preset", "texture", "pairing", "radius", "density", "motion", "neutral", "defaultMode"] as const) {
      const list = variants(s, field);
      expect(list.length).toBeGreaterThan(1);
      for (const v of list) expect(v.error, `${field}=${v.value}`).toBeUndefined();
    }
  });

  it("starts from a preset, keeps chosen surfaces, and undoes", () => {
    const s = createSession({ name: "Meridian" });
    setSurfaces(s, ["web-app", "messaging"]);
    startFrom(s, "glass");
    expect(s.config.texture).toBe("glass");
    expect(s.config.surfaces).toEqual(["web-app", "messaging"]);
    undo(s);
    expect(s.config.texture).toBe("minimal");
    expect(() => setSurfaces(s, ["nope"])).toThrow(/at least one/);
  });

  it("guesses a texture from the description", () => {
    expect(heuristicTexture("Observability for API teams")).toBe("technical");
    expect(heuristicTexture("Wealth management for families")).toBe("editorial");
    expect(heuristicTexture("A travel companion app")).toBe("glass");
    expect(heuristicTexture("Project tracking")).toBe("minimal");
  });
});

describe("writeRepo", () => {
  const base = () => {
    const s = createSession({ name: "Meridian", description: "Usage-based billing" });
    return { config: s.config, copy: s.copy, visibility: "private" as const, github: "none" as const };
  };

  it("writes a complete, reproducible system repo", () => {
    const dir = join(tmp(), "meridian-design");
    const files = writeRepo({ ...base(), dir, hosting: "intranet" });
    for (const f of ["design.config.ts", "specimen.copy.json", "package.json", "README.md", ".gitignore", ".github/workflows/design-system.yml", "public/index.html", "public/DESIGN.md", "public/llms.txt", "public/r/registry.json", "public/r/base.json"]) {
      expect(files, f).toContain(f);
      expect(existsSync(join(dir, f)), f).toBe(true);
    }
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toMatch(/\.env\*\.local/);
    expect(readFileSync(join(dir, "README.md"), "utf8")).toMatch(/single sign-on/);
    const copy = JSON.parse(readFileSync(join(dir, "specimen.copy.json"), "utf8"));
    expect(copy.byModel).toBeUndefined();
  });

  it("refuses a folder that already has files", () => {
    const dir = tmp();
    writeFileSync(join(dir, "notes.txt"), "keep me");
    expect(() => writeRepo({ ...base(), dir, hosting: "later" })).toThrow(/already has files/);
  });

  const cases: [Hosting, string[], string[]][] = [
    ["pages", [".github/workflows/docs.yml"], ["vercel.json", "server.mjs"]],
    ["vercel", ["vercel.json"], ["server.mjs", ".github/workflows/docs.yml"]],
    ["railway", ["server.mjs", "railway.json"], ["vercel.json"]],
    ["render", ["server.mjs", "render.yaml"], ["railway.json"]],
    ["later", [], ["server.mjs", "vercel.json", ".github/workflows/docs.yml"]],
  ];
  it.each(cases)("adds the files %s needs", (hosting, present, absent) => {
    const dir = join(tmp(), "repo");
    const files = writeRepo({ ...base(), dir, hosting });
    for (const f of present) expect(files).toContain(f);
    for (const f of absent) expect(files).not.toContain(f);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(pkg.scripts.start === "node server.mjs").toBe(hosting === "railway" || hosting === "render");
  });

  it("saves the model key only to .env.local, and only when asked", () => {
    const dir = join(tmp(), "a");
    const model = { provider: "anthropic" as const, apiKey: "sk-ant-test" };
    writeRepo({ ...base(), dir, hosting: "later", model, saveKey: true });
    expect(readFileSync(join(dir, ".env.local"), "utf8")).toMatch(/ANTHROPIC_API_KEY=sk-ant-test/);
    const dir2 = join(tmp(), "b");
    mkdirSync(dir2);
    writeRepo({ ...base(), dir: dir2, hosting: "later", model, saveKey: false });
    expect(existsSync(join(dir2, ".env.local"))).toBe(false);
  });
});
