import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";
import { presets } from "../../presets/src/index.js";
import {
  FORMATS,
  SURFACES,
  animationDefaults,
  animationDocument,
  animationsFor,
  buildSystem,
  defaultCopy,
  motionCss,
  motionLanguage,
  motionModule,
  parseMetric,
  renderAnimation,
  springCurve,
  type AnimationFormat,
} from "../src/index.js";

const copy = defaultCopy("Northwind", "Project planning for agencies that bill by the hour");

describe("brand animations", () => {
  for (const [name, preset] of Object.entries(presets)) {
    it(`renders every animation for ${name} in every format`, () => {
      const s = buildSystem({ ...preset, surfaces: [...SURFACES] });
      const list = animationsFor(s);
      expect(list.length).toBeGreaterThanOrEqual(11);
      for (const a of list) {
        for (const format of Object.keys(FORMATS) as AnimationFormat[]) {
          const r = renderAnimation(s, a.id, { copy, format });
          expect(r.duration, `${a.id} ${format}`).toBeGreaterThan(1000);
          expect(r.html, `${a.id} ${format}`).not.toMatch(/undefined|NaN|\[object Object\]/);
        }
      }
      const css = motionCss(s);
      expect(css).toContain(".adm-stage.adm-dark");
      expect(css).not.toMatch(/undefined|NaN/);
    });
  }

  it("moves the way the profile says: still fades, expressive springs", () => {
    const still = motionLanguage(buildSystem({ ...presets.quiet!, motion: "still" }));
    const expressive = motionLanguage(buildSystem({ ...presets.quiet!, motion: "expressive" }));
    expect(still.travel).toBe(0);
    expect(still.scaleFrom).toBe(1);
    expect(expressive.spring).toMatch(/^linear\(0, /);
    expect(expressive.travel).toBeGreaterThan(motionLanguage(buildSystem(presets.quiet!)).travel);
    const curve = springCurve(0.15).slice(7, -1).split(", ").map(Number);
    expect(curve[0]).toBe(0);
    expect(curve.at(-1)).toBe(1);
    expect(Math.max(...curve)).toBeGreaterThan(1);
  });

  it("only offers scenes for the surfaces a system has", () => {
    const s = buildSystem({ ...presets.quiet!, surfaces: ["marketing"] });
    const ids = animationsFor(s).map((a) => a.id);
    expect(ids).not.toContain("chat-demo");
    expect(ids).not.toContain("product-demo");
    expect(ids).toContain("launch");
    expect(() => renderAnimation(s, "chat-demo", { copy })).toThrow(/surfaces/);
    // The launch film falls back to a scene the system does have.
    expect(renderAnimation(s, "launch", { copy }).html).toContain("data-count");
  });

  it("puts a sequence's words in the scene that owns them", () => {
    const s = buildSystem({ ...presets.quiet!, surfaces: ["web-app", "marketing"] });
    expect(animationDefaults("launch", s, copy).title).toBe(copy.headline);
    const r = renderAnimation(s, "launch", { copy, props: { title: "Approvals in one click", items: ["One", "Two"] } });
    expect(r.html.match(/Approvals/g)?.length).toBe(1);
    expect(r.html).toContain(`New in ${copy.product}`);
    expect(r.html).toContain(">One<");
  });

  it("counts numbers in their own format", () => {
    expect(parseMetric("92%")).toEqual({ prefix: "", value: 92, suffix: "%", decimals: 0, grouped: false });
    expect(parseMetric("$48,200")).toEqual({ prefix: "$", value: 48200, suffix: "", decimals: 0, grouped: true });
    expect(parseMetric("4.5x")).toMatchObject({ value: 4.5, decimals: 1, suffix: "x" });
  });

  it("writes a standalone file that plays, and a render mode for video", () => {
    const s = buildSystem(presets.glass!);
    const play = animationDocument(s, "announcement", { copy, format: "square" });
    expect(play).toContain("ADMotion.mount");
    expect(play).toContain('data-format="square"');
    expect(play).toContain("fonts.googleapis.com");
    const render = animationDocument(s, "announcement", { copy, purpose: "render" });
    expect(render).toContain("autoplay: false");
  });

  it("ships its motion as a module apps can import", () => {
    for (const preset of Object.values(presets)) {
      const src = motionModule(buildSystem(preset));
      expect(() => transformSync(src, { loader: "ts" })).not.toThrow();
      expect(src).toContain("export const enter");
    }
  });
});
