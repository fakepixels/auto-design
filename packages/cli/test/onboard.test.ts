import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSession,
  generateOptions,
  photosForPage,
  heuristicTexture,
  setKind,
  setProduct,
  setSurfaces,
  slug,
  startFrom,
  undo,
  variants,
} from "../src/onboard/session.js";
import { publish, writeRepo, type Hosting } from "../src/onboard/publish.js";
import { imageSize, writePhotos } from "../src/onboard/photos.js";

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
    for (const field of ["preset", "texture", "pairing", "radius", "density", "motion", "neutral", "defaultMode", "brand", "kind", "vibe"] as const) {
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

  it("makes starting points from a site and images, offered before the presets", () => {
    const s = createSession({ name: "Meridian", description: "Observability for API teams" });
    s.site = {
      url: "https://meridian.dev/", title: "Meridian", description: "", themeColor: null,
      colors: [{ css: "#0f62fe", hex: "#0f62fe", score: 9 }], neutral: "cool", fonts: ["Inter"], pairing: null,
      catalogFonts: null, radius: 6, dark: false, summary: "",
    };
    const made = generateOptions(s, ["#e4572e", "#29335c", "not a color"]);
    // Close to the reference, then three that compose pages differently, not three shades of one color.
    expect(made.map((g) => g.id)).toEqual(["gen:ref", "gen:photo", "gen:type", "gen:bold"]);
    expect(made[0]!.note).toBe("#0f62fe, Inter, 6px corners");
    expect(made[0]!.config.texture).toBe("technical");
    expect(made[0]!.config.color.brand).toBe("#0f62fe");
    expect(made[1]!.config.art).toMatchObject({ imagery: "leading", hero: "full-bleed", grid: "open" });
    expect(made[2]!.config.art).toMatchObject({ imagery: "none", hero: "type", grid: "editorial", display: "dramatic" });
    expect(new Set(made.map((g) => JSON.stringify(g.config.art))).size).toBe(made.length);
    expect(s.imageColors).toEqual(["#e4572e", "#29335c"]);

    const list = variants(s, "preset");
    expect(list.slice(0, 4).map((v) => v.tag)).toEqual(["From your site", "From your site", "From your site", "From your site"]);
    expect(list.length).toBe(9);

    startFrom(s, "gen:type");
    expect(s.config.color.brand).toBe("#0f62fe");
    expect(s.preset).toBe("gen:type");
    expect(s.history.at(-1)!.label).toBe("Started from type leading");
  });

  it("takes a kind's direction, and a bolder take leads with the site's strongest color", () => {
    const s = createSession({ name: "Hello Kitty", description: "Characters and gifts" });
    setKind(s, "consumer", "playful");
    expect(s.config.texture).toBe("tactile");
    expect(s.config.shape?.radius).toBe(16);
    expect(s.history.at(-1)!.label).toBe("Kind: Consumer app, playful");
    s.site = {
      url: "https://sanrio.com/", title: "Sanrio", description: "", themeColor: null,
      colors: [{ css: "#007ace", hex: "#007ace", score: 9 }, { css: "#c70000", hex: "#c70000", score: 4 }], neutral: null, fonts: ["Jost"], pairing: null,
      catalogFonts: null, radius: 3, dark: false, summary: "",
    };
    const made = generateOptions(s, []);
    const bold = made.find((g) => g.id === "gen:bold")!;
    expect(bold.name).toBe("Your site, playful");
    expect(bold.config.color.brand).toBe("#c70000");
    expect(bold.config.texture).toBe("tactile");
    // The faithful option keeps the site's own color and corners.
    expect(made[0]!.config.color.brand).toBe("#007ace");
    expect(made[0]!.config.shape?.radius).toBe(3);

    setKind(s, "agent");
    expect(s.vibe).toBeNull();
    expect(s.config.surfaces).toContain("chat");
    expect(variants(s, "kind").find((v) => v.value === "ecommerce")!.scene).toBe("shop");
  });

  it("offers ready palettes with the current color first and no repeats", () => {
    const s = createSession({ name: "Meridian" });
    s.imageColors = ["#e4572e"];
    const list = variants(s, "brand");
    expect(list[0]!.value).toBe("current");
    expect(list[1]!.tag).toBe("From your images");
    const hexes = list.map((v) => v.note);
    expect(new Set(hexes).size).toBe(hexes.length);
    // Quiet's ink is the current color, so the Ink palette isn't offered twice.
    expect(list.some((v) => v.value === "ink")).toBe(false);
    expect(list.find((v) => v.value === "forest")!.patch).toEqual({ brand: "oklch(0.46 0.09 158)", neutral: "warm" });
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
    for (const f of ["design.config.ts", "specimen.copy.json", "package.json", "README.md", ".gitignore", ".github/workflows/design-system.yml", "public/DESIGN.md", "public/llms.txt", "public/r/registry.json", "public/r/base.json"]) {
      expect(files, f).toContain(f);
      expect(existsSync(join(dir, f)), f).toBe(true);
    }
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toMatch(/\.env\*\.local/);
    expect(readFileSync(join(dir, "README.md"), "utf8")).toMatch(/single sign-on/);
    const copy = JSON.parse(readFileSync(join(dir, "specimen.copy.json"), "utf8"));
    expect(copy.byModel).toBeUndefined();
  });

  it("publishes locally with the design site built and committed", async () => {
    const dir = join(tmp(), "meridian-design");
    const r = await publish({ ...base(), dir, hosting: "intranet" });
    const site = r.steps.find((st) => st.step === "Build the design site");
    expect(site?.ok, site?.detail).toBe(true);
    for (const f of ["public/index.html", "public/docs/index.html", "public/docs/components/button/index.html", "public/_site/site.css", "public/_site/previews.js"]) {
      expect(existsSync(join(dir, f)), f).toBe(true);
    }
    expect(readFileSync(join(dir, "public/index.html"), "utf8")).toContain("Meridian");
  }, 60_000);

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

describe("references and photos", () => {
  it("starts close to a black-and-white, photo-led site, and offers other compositions beside it", () => {
    const s = createSession({ name: "Maison", description: "Leather goods and ready-to-wear" });
    setKind(s, "ecommerce");
    s.site = {
      url: "https://maison.example/", title: "Maison", description: "", themeColor: null, colors: [], neutral: "warm", fonts: [], pairing: null,
      catalogFonts: null, radius: 0, dark: false, summary: "",
      look: {
        source: "site", imagery: "leading", hero: "full-bleed", grid: "open", labels: "uppercase", display: "dramatic", logo: "wordmark",
        ink: true, inkColor: "#111111", dark: false, photoShare: 0.9, headlineRatio: 5.6, headlineFont: "Cormorant Garamond", uiColors: [], facts: ["Photography leads", "A full-bleed first screen", "A centered wordmark"],
      },
    };
    const made = generateOptions(s, []);
    expect(made.slice(0, 4).map((g) => g.id)).toEqual(["gen:ref", "gen:photo", "gen:type", "gen:split"]);
    const ref = made[0]!;
    expect(ref.name).toBe("Close to your site");
    expect(ref.note).toBe("Photography leads, a full-bleed first screen, a centered wordmark");
    expect(ref.config.color.brand).toBe("#111111");
    expect(ref.config.art).toMatchObject({ imagery: "leading", hero: "full-bleed", grid: "open", labels: "uppercase", display: "dramatic", logo: "wordmark" });
    expect(ref.config.shape?.radius).toBe(0);
    // The others keep the ink, type and wordmark but compose differently, and no two share a first screen.
    expect(made[1]!.config.art?.hero).toBe("centered");
    expect(made[2]!.config.art).toMatchObject({ hero: "type", imagery: "none", labels: "uppercase", logo: "wordmark" });
    expect(made[3]!.config.art).toMatchObject({ hero: "split", grid: "cards", logo: "wordmark" });
    expect(new Set(made.slice(0, 4).map((g) => g.config.art?.hero)).size).toBe(4);
    expect(new Set(made.slice(0, 4).map((g) => g.config.color.brand))).toEqual(new Set(["#111111"]));
    // The kind's own starting point takes the site's ink instead of its stock color.
    expect(made.find((g) => g.id === "gen:kind")!.config.color.brand).toBe("#111111");
  });

  it("orders photos for the first screen: a wide one for full-bleed, a tall one beside the words", () => {
    const p = (id: string, width: number, height: number) => ({ id, url: id, thumb: id, width, height, alt: id, title: id, creator: null, creatorUrl: null, license: "cc0", licenseVersion: null, licenseUrl: null, landing: null, credit: "", source: "openverse" as const });
    const list = [p("square", 800, 800), p("tall", 600, 900), p("wide", 1600, 900)];
    expect(photosForPage(list, "full-bleed")[0]!.id).toBe("wide");
    expect(photosForPage(list, "split")[0]!.id).toBe("tall");
    expect(photosForPage(list, "split").length).toBe(3);
  });

  it("writes the person's own photos into images/ with their credits", async () => {
    const dir = tmp();
    // A 2×3 PNG: enough for the header to give its size.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEklEQVR4nGP4z8DAwMDAxAADAA0EAQB3dm0kAAAAAElFTkSuQmCC", "base64");
    const own = new Map([["own:1", { mediaType: "image/png", data: png }]]);
    const photo = { id: "own:1", url: "/photos/own/1", thumb: "/photos/own/1", width: 2, height: 3, alt: "Our tote", title: "tote.png", creator: null, creatorUrl: null, license: "own", licenseVersion: null, licenseUrl: null, landing: null, credit: "Your photo", source: "own" as const };
    const r = await writePhotos(dir, [photo], own);
    expect(r.failed).toEqual([]);
    expect(r.written[0]).toMatchObject({ file: "photo-01.png", alt: "Our tote", width: 2, height: 3, credit: "Your photo" });
    expect(JSON.parse(readFileSync(join(dir, "images", "credits.json"), "utf8")).images[0].file).toBe("photo-01.png");
    expect(readFileSync(join(dir, "images", "CREDITS.md"), "utf8")).toContain("`photo-01.png`: Our tote. Your photo");
    expect(imageSize(png)).toEqual({ width: 2, height: 3 });
  });
});
