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
    // Hand-picked faces in place of a pairing read as one change of type.
    const faces = applyPatch(quiet, { fonts: { sans: "inter", mono: "jetbrains-mono", display: "cormorant-garamond" } });
    expect(describeChanges(quiet, faces)).toEqual(["Type: Geist → Cormorant Garamond + Inter"]);
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
      pairing: null, catalogFonts: { sans: "work-sans", mono: "jetbrains-mono", display: "gloock" }, radius: null, dark: false,
    });
    const config = applyPatch(quiet, patch);
    expect(config.type.sans.family).toBe("Work Sans Variable");
    expect(config.type.display?.family).toBe("Gloock");
    expect(validate(config).ok).toBe(true);
  });

  it("turns what it read into a patch", () => {
    const patch = patchFromSite({
      url: "https://x", title: "", description: "", themeColor: null, summary: "",
      colors: [{ css: "", hex: "#0f766e", score: 9 }], neutral: "warm", fonts: [], pairing: "figtree", catalogFonts: null, radius: 12, dark: true,
    });
    expect(patch).toEqual({ brand: "#0f766e", neutral: "warm", pairing: "figtree", radius: 12, defaultMode: "dark" });
    expect(validate(applyPatch(quiet, patch)).ok).toBe(true);
  });
});
