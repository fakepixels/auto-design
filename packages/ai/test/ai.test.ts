import { afterEach, describe, expect, it, vi } from "vitest";
import { presets } from "../../presets/src/index.js";
import {
  applyPatch,
  callJson,
  describeChanges,
  emptyPatch,
  patchFromSite,
  patchSchema,
  rankColors,
  refine,
  setMockHandler,
  suggest,
  validate,
  writeCopy,
  copySchema,
  pairingForFonts,
  catalogFontsForSite,
  emptyMeasure,
  measureCss,
  ownPage,
  ratioFor,
  mockDesigner,
  type JsonRequest,
} from "../src/index.js";
import { quickTweak } from "../src/mock.js";

const quiet = presets.quiet!;

/** Every object in a schema must forbid extra keys and require all of its properties (OpenAI strict mode). */
function assertStrict(schema: any, path = "$") {
  if (schema.anyOf) return schema.anyOf.forEach((s: any, i: number) => assertStrict(s, `${path}.anyOf[${i}]`));
  if (schema.type === "object") {
    expect(schema.additionalProperties, path).toBe(false);
    expect([...schema.required].sort(), path).toEqual(Object.keys(schema.properties).sort());
    for (const [k, v] of Object.entries(schema.properties)) assertStrict(v, `${path}.${k}`);
  }
  if (schema.type === "array") assertStrict(schema.items, `${path}[]`);
  for (const bad of ["minimum", "maximum", "minLength", "maxLength"]) expect(schema[bad], `${path} ${bad}`).toBeUndefined();
}

afterEach(() => {
  setMockHandler(null);
  vi.unstubAllGlobals();
});

describe("schemas", () => {
  it("are valid for strict structured outputs on every provider", () => {
    assertStrict(patchSchema());
    assertStrict(copySchema());
  });
});

describe("applyPatch", () => {
  it("clamps and drops values outside the system's options", () => {
    const next = applyPatch(quiet, { ...emptyPatch(), radius: 99, energy: 3, texture: "brutalist" as never, pairing: "comic-sans" });
    expect(next.shape?.radius).toBe(20);
    expect(next.personality?.energy).toBe(1);
    expect(next.texture).toBe(quiet.texture);
    expect(next.type.sans.family).toBe(quiet.type.sans.family);
  });

  it("swaps fonts as a pairing and removes a display face the new pairing lacks", () => {
    const withDisplay = applyPatch(quiet, { pairing: "instrument" });
    expect(withDisplay.type.display?.family).toBe("Instrument Serif");
    const back = applyPatch(withDisplay, { pairing: "geist" });
    expect(back.type.display).toBeUndefined();
    expect(validate(back).ok).toBe(true);
  });

  it("describes changes in words", () => {
    const next = applyPatch(quiet, { neutral: "warm", radius: 10, pairing: "figtree" });
    expect(describeChanges(quiet, next)).toEqual(["Grays: cool → warm", "Type: Geist → Figtree", "Corners: 8px → 10px"]);
  });
});

describe("the designer, against a mock model", () => {
  it("retries once with the compiler's error, then succeeds", async () => {
    const calls: JsonRequest[] = [];
    setMockHandler((req) => {
      calls.push(req);
      return calls.length === 1
        ? { patch: { ...emptyPatch(), brand: "not a color" }, summary: "x" }
        : { patch: { ...emptyPatch(), brand: "#0f766e" }, summary: "Teal brand." };
    });
    const r = await refine({ provider: "mock", apiKey: "" }, quiet, "make it teal");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.content[0]).toMatchObject({ type: "text" });
    expect((calls[1]!.content[0] as { text: string }).text).toMatch(/rejected/);
    expect(r.config.color.brand).toBe("#0f766e");
    expect(r.changes[0]).toMatch(/^Brand color: /);
  });

  it("gives up after two bad answers", async () => {
    setMockHandler(() => ({ patch: { ...emptyPatch(), brand: "nope" }, summary: "" }));
    await expect(refine({ provider: "mock", apiKey: "" }, quiet, "x")).rejects.toThrow(/didn't pass the compiler/);
  });

  it("suggests from material and keeps the brand color it was given", async () => {
    setMockHandler(mockDesigner(() => quiet));
    const s = await suggest({ provider: "mock", apiKey: "" }, {
      product: "Ledgerly",
      description: "Bookkeeping and finance for law firms",
      imageColors: ["#7a2e2a"],
      current: quiet,
    });
    expect(s.config.texture).toBe("editorial");
    expect(s.config.color.brand).toBe("#7a2e2a");
    expect(s.reasons.length).toBeGreaterThan(0);
  });

  it("writes copy that keeps the shapes previews rely on", async () => {
    setMockHandler(mockDesigner(() => quiet));
    const copy = await writeCopy({ provider: "mock", apiKey: "" }, "Ledgerly", "Bookkeeping for law firms");
    expect(copy.product).toBe("Ledgerly");
    expect(copy.nav).toHaveLength(5);
    expect(copy.table.columns).toHaveLength(4);
    expect(copy.metrics).toHaveLength(3);
  });
});

describe("quick tweaks without a model", () => {
  it("maps plain requests to system options", () => {
    expect(quickTweak(quiet, "Warmer")).toMatchObject({ neutral: "warm" });
    expect(quickTweak(quiet, "Rounder")).toMatchObject({ radius: 12 });
    expect(quickTweak(quiet, "Denser, like Linear")).toMatchObject({ density: "compact" });
    expect(quickTweak(quiet, "Calmer motion")).toMatchObject({ motion: "still" });
  });
});

describe("providers", () => {
  it("sends Claude a JSON schema in output_config and reads the text block", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("claude-sonnet-5-5");
      expect(body.output_config.format.type).toBe("json_schema");
      expect(body.temperature).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
      expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-test");
      return new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"ok":true}' }] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await callJson({ provider: "anthropic", apiKey: "sk-ant-test" }, { system: "s", content: [{ type: "text", text: "hi" }], schema: { type: "object" }, name: "x" });
    expect(out).toEqual({ ok: true });
  });

  it("asks Claude again without effort when a model rejects it", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      n++;
      if (body.output_config.effort) return new Response(JSON.stringify({ error: { message: "effort is not supported" } }), { status: 400 });
      return new Response(JSON.stringify({ content: [{ type: "text", text: '{"a":1}' }] }));
    }));
    expect(await callJson({ provider: "anthropic", apiKey: "k" }, { system: "", content: [], schema: {}, name: "x" })).toEqual({ a: 1 });
    expect(n).toBe(2);
  });

  it("sends OpenAI and OpenRouter a strict json_schema response format", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      seen.push(url);
      const body = JSON.parse(init.body as string);
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.messages[1].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AAA" } });
      return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"b":2}\n```' } }] }));
    }));
    const req = { system: "s", content: [{ type: "text" as const, text: "t" }, { type: "image" as const, mediaType: "image/png", data: "AAA" }], schema: {}, name: "x" };
    expect(await callJson({ provider: "openai", apiKey: "k" }, req)).toEqual({ b: 2 });
    expect(await callJson({ provider: "openrouter", apiKey: "k" }, req)).toEqual({ b: 2 });
    expect(seen).toEqual(["https://api.openai.com/v1/chat/completions", "https://openrouter.ai/api/v1/chat/completions"]);
  });

  it("explains a rejected key in plain words", async () => {
    const { verifyKey } = await import("../src/providers.js");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const r = await verifyKey({ provider: "anthropic", apiKey: "bad" });
    expect(r).toEqual({ ok: false, error: "That key was rejected. Check that it's active and copied in full." });
  });
});

describe("site extraction", () => {
  it("ranks named brand variables and theme-color above incidental colors", () => {
    const css = `:root{--brand-primary:#0f766e;--gray-100:#f1f5f9;--gray-500:#64748b}
      .a{color:#e11d48}.b{color:#0f766e}.c{background:#0f766e}.d{border-color:#cbd5e1}`;
    const { colors, neutral } = rankColors(css, null);
    expect(colors[0]!.hex).toBe("#0f766e");
    expect(neutral).toBe("cool");
  });

  it("maps site fonts onto a catalog pairing", () => {
    expect(pairingForFonts(["Inter", "Geist"])).toBe("inter");
    expect(pairingForFonts(["Geist"])).toBe("geist");
    expect(pairingForFonts(["Playfair Display"])).toBe("playfair");
    expect(pairingForFonts(["Times New Roman"])).toBe("instrument");
    expect(pairingForFonts(["Fira Mono"])).toBe("plex");
  });

  it("keeps a site's own catalog faces when no pairing matches them", () => {
    expect(catalogFontsForSite(["Work Sans", "Space Mono", "Gloock"])).toEqual({ sans: "work-sans", mono: "space-mono", display: "gloock" });
    expect(catalogFontsForSite(["Helvetica Neue"])).toBeNull();
    const patch = patchFromSite({
      url: "https://x", title: "", description: "", themeColor: null, summary: "", colors: [], neutral: null, fonts: ["Work Sans", "Gloock"],
      pairing: null, catalogFonts: { sans: "work-sans", mono: "jetbrains-mono", display: "gloock" }, radius: null, dark: false, page: null, measure: emptyMeasure(), measuredFrom: "css",
    });
    const config = applyPatch(quiet, patch);
    expect(config.type.sans.family).toBe("Work Sans Variable");
    expect(config.type.display?.family).toBe("Gloock");
    expect(validate(config).ok).toBe(true);
  });

  it("turns what it read into a patch", () => {
    const patch = patchFromSite({
      url: "https://x", title: "", description: "", themeColor: null, summary: "",
      colors: [{ css: "", hex: "#0f766e", score: 9 }], neutral: "warm", fonts: [], pairing: "figtree", catalogFonts: null, radius: 12, dark: true, page: null, measure: emptyMeasure(), measuredFrom: "css",
    });
    expect(patch).toEqual({ brand: "#0f766e", neutral: "warm", pairing: "figtree", radius: 12, defaultMode: "dark" });
    expect(validate(applyPatch(quiet, patch)).ok).toBe(true);
  });

  const PAPER_CSS = `
    :root { --paper: #efe6d3; --moss: #3f5a36; }
    body { background: var(--paper); font-family: "Outfit", sans-serif; font-size: 19px; }
    h1, h2 { font-family: "Newsreader", serif; font-weight: 400; letter-spacing: 0; }
    h1 { font-size: 56px; }
    p { font-family: "Outfit", sans-serif; } label { font-family: "Outfit", sans-serif; } small { font-family: "Outfit", sans-serif; }
    .cta { background: var(--moss); border-radius: 10px; min-height: 52px; }
    @media (max-width: 600px) { h1 { font-size: 38px; } body { font-size: 17px; } }
    @media (prefers-color-scheme: dark) { body { background: #111; } }
    .dark body { background: #000; }`;
  const PAPER_HTML = `<html><body><h1>Medicare for the long haul</h1><button class="cta">Compare</button></body></html>`;

  it("measures how a page is set: its ground, faces by job, sizes, weight and buttons", () => {
    expect(measureCss(PAPER_CSS, PAPER_HTML)).toEqual({
      background: "#efe6d3", bodyFont: "Outfit", headingFont: "Newsreader", bodyKind: "sans", headingKind: "serif",
      bodySize: 19, headingSize: 56, headingWeight: 400, headingTracking: 0, controlHeight: 52, radius: 10,
    });
  });

  it("reads a Tailwind build the same way: classes on the elements, variables on the root, nested media", () => {
    const css = `
      @layer theme { :root, :host { --font-sans: "Outfit", ui-sans-serif, sans-serif; --font-serif: "Newsreader", ui-serif, serif; --text-4xl: 2.25rem; --background: 43 47% 88%; --spacing: 0.25rem; --font-weight-normal: 400; } }
      @layer base { h1, h2 { font-size: inherit; font-weight: inherit; } html { font-family: var(--font-sans); } }
      @layer utilities {
        .bg-background { background-color: hsl(var(--background)); }
        .font-serif { font-family: var(--font-serif); }
        .text-\\[19px\\] { font-size: 19px; }
        .text-4xl { font-size: var(--text-4xl); }
        .font-normal { font-weight: var(--font-weight-normal); }
        .h-14 { height: calc(var(--spacing) * 14); }
        .md\\:text-\\[56px\\] { @media (width >= 48rem) { font-size: 56px; } }
        .dark\\:bg-black { &:where(.dark, .dark *) { background-color: #000; } }
      }`;
    const html = `<html><body class="bg-background text-[19px] dark:bg-black"><h1 class="font-serif text-4xl md:text-[56px] font-normal">Hi</h1><button class="h-14">Go</button></body></html>`;
    const m = measureCss(css, html);
    expect(m).toMatchObject({ bodyFont: "Outfit", headingFont: "Newsreader", headingKind: "serif", bodySize: 19, headingSize: 56, headingWeight: 400, controlHeight: 56 });
    expect(ownPage(m.background)?.hex).toBe("#efe7d2");
  });

  it("treats a page color as the product's own unless it's plain white or the stock near-black", () => {
    expect(ownPage("#efe6d3")?.hex).toBe("#efe6d3");
    expect(ownPage("#0b1220")?.hex).toBe("#0b1220");
    expect(ownPage("#ffffff")).toBeNull();
    expect(ownPage("#fdfdfd")).toBeNull();
    expect(ownPage("#0a0a0a")).toBeNull();
    // A saturated mid-tone isn't a ground text can sit on.
    expect(ownPage("#3f5a36")).toBeNull();
    expect(ownPage(null)).toBeNull();
  });

  it("gives each face the job the site gives it, whichever is named more often", () => {
    const roles = { bodyFont: "Outfit", headingFont: "Newsreader", bodyKind: "sans", headingKind: "serif" } as const;
    const want = { sans: "outfit", mono: "jetbrains-mono", display: "newsreader" };
    expect(catalogFontsForSite(["Outfit", "Newsreader"], roles)).toEqual(want);
    expect(catalogFontsForSite(["Newsreader", "Outfit"], roles)).toEqual(want);
    // One face for everything stays one face.
    expect(catalogFontsForSite(["Outfit"], { bodyFont: "Outfit", headingFont: "Outfit" })).toEqual({ sans: "outfit", mono: "jetbrains-mono", display: null });
    // Faces the catalog doesn't have fall to a pairing of the same shape, not to a guess from another site.
    expect(catalogFontsForSite(["Tiempos", "Sohne"], { bodyFont: "Sohne", headingFont: "Tiempos" })).toBeNull();
    expect(pairingForFonts(["Tiempos", "Sohne"], { bodyFont: "Sohne", headingFont: "Tiempos", bodyKind: "sans", headingKind: "serif" })).toBe("newsroom");
    expect(pairingForFonts(["Tiempos"], { bodyFont: "Tiempos", headingFont: "Tiempos", bodyKind: "serif", headingKind: "serif" })).toBe("source-serif");
  });

  it("finds a scale that has the site's own headline size on it", () => {
    expect(ratioFor(19, 56)).toBe(1.197);
    expect(ratioFor(16, 18)).toBeNull();
    const system = validate(applyPatch(quiet, { baseSize: 19, ratio: ratioFor(19, 56)! }));
    expect(system.ok && Object.values(system.system.type.scale).map((v) => v.px)).toContain(56);
  });

  it("keeps what a site measured: page, sizes, headline weight, faces and button height", () => {
    const measure = measureCss(PAPER_CSS, PAPER_HTML);
    const patch = patchFromSite({
      url: "https://x", title: "", description: "", themeColor: null, summary: "", colors: [{ css: "", hex: "#3f5a36", score: 9 }], neutral: "warm",
      fonts: ["Newsreader", "Outfit"], pairing: "newsroom", catalogFonts: catalogFontsForSite(["Newsreader", "Outfit"], measure), radius: 10, dark: false,
      page: ownPage(measure.background), measure, measuredFrom: "css",
    });
    expect(patch).toMatchObject({ page: "#efe6d3", baseSize: 19, ratio: 1.197, headingWeight: 400, tracking: "normal", density: "spacious", radius: 10 });
    // Started from the smallest, tightest preset on purpose: none of its defaults may survive what the site showed.
    const config = applyPatch(quiet, patch);
    const built = validate(config);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.system.type.scale.base.px).toBe(19);
    expect(config.type.display?.family).toMatch(/^Newsreader/);
    expect(config.type.display?.weights).toEqual([400]);
    expect(config.type.sans.family).toMatch(/^Outfit/);
    expect(config.density).toBe("spacious");
    expect(describeChanges(quiet, config).join("; ")).toMatch(/Page color: none → #efe6d3.*Body text: 14px → 19px.*Headline weight: none → 400/);
  });

  it("drops a headline weight the next typeface doesn't carry, and removes a page color on request", () => {
    const paper = applyPatch(quiet, { page: "#efe6d3", fonts: { sans: "outfit", mono: "jetbrains-mono", display: "newsreader" }, headingWeight: 400 });
    expect(paper.type.headingWeight).toBe(400);
    const next = applyPatch(paper, { pairing: "bricolage", page: "none" });
    expect(next.type.headingWeight).toBeUndefined();
    expect(next.color.page).toBeUndefined();
    expect(validate(next).ok).toBe(true);
    // Not a color: ignored, never passed through.
    expect(applyPatch(quiet, { page: "url(x)" }).color.page).toBeUndefined();
  });
});
