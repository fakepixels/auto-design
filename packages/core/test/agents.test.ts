import { compile } from "@tailwindcss/node";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { presets } from "../../presets/src/index.js";
import {
  CARD_SIZES,
  HOST_ROLE_MAP,
  SURFACES,
  agentTheme,
  buildGuardrails,
  buildSystem,
  checkMessage,
  emitAll,
  emitCss,
  emitDesignMd,
  renderCardSvg,
  smsInfo,
  themeFontsHref,
  toPlainText,
  type MessageOptions,
} from "../src/index.js";

const require = createRequire(import.meta.url);
const tailwindDir = dirname(require.resolve("tailwindcss/package.json"));
const rules = (text: string, o: MessageOptions) => checkMessage(text, o).issues.map((i) => i.rule);

describe("SMS encoding", () => {
  it("counts GSM-7 segments", () => {
    expect(smsInfo("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1, remaining: 0 });
    expect(smsInfo("a".repeat(161))).toMatchObject({ encoding: "GSM-7", segments: 2 });
    expect(smsInfo("a".repeat(306)).segments).toBe(2);
    expect(smsInfo("a".repeat(307)).segments).toBe(3);
  });
  it("counts extension characters twice", () => {
    expect(smsInfo("€".repeat(80))).toMatchObject({ encoding: "GSM-7", length: 160, segments: 1 });
    expect(smsInfo("[]").length).toBe(4);
  });
  it("switches to UCS-2 for curly quotes and emoji", () => {
    expect(smsInfo("It’s here").encoding).toBe("UCS-2");
    expect(smsInfo("x".repeat(70)).encoding).toBe("GSM-7");
    expect(smsInfo("🎉".repeat(35))).toMatchObject({ encoding: "UCS-2", length: 70, segments: 1 });
    expect(smsInfo("🎉".repeat(36)).segments).toBe(2);
  });
});

describe("plain text", () => {
  it("removes markdown without losing content", () => {
    const md = "## Summary\n\n- **Revenue** up 12%\n* Run `npm run build`\n\n> quoted\n\n[Open the report](https://x.dev/r) or <https://x.dev>\n\n| a | b |\n|---|---|\n| 1 | 2 |";
    expect(toPlainText(md)).toBe("Summary\n\n- Revenue up 12%\n- Run npm run build\n\nquoted\n\nOpen the report: https://x.dev/r or https://x.dev\n\na, b\n1, 2");
  });
  it("leaves snake_case and URLs alone", () => {
    expect(toPlainText("Set api_key_id in https://x.dev/a_b_c")).toBe("Set api_key_id in https://x.dev/a_b_c");
  });
});

describe("message rules", () => {
  const sms: MessageOptions = { channel: "sms", product: "Meridian", first: true };

  it("passes a good text", () => {
    const r = checkMessage("Meridian: Your October report is ready. 3 projects need a decision by Friday. https://meridian.app/r/oct", sms);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.sms).toMatchObject({ encoding: "GSM-7", segments: 1 });
  });

  it("catches a bad one and fixes what it can", () => {
    const r = checkMessage("Hey there!! 🎉 Your **report** is READY: https://bit.ly/x and https://meridian.app/d", { ...sms, kind: "marketing" });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.rule).sort()).toEqual(["emoji", "exclamation", "filler", "links", "markdown", "opt-out", "sender", "shortener", "shouting"]);
    expect(r.text).toBe("Hey there!! Your report is READY: https://bit.ly/x and https://meridian.app/d");
  });

  it("swaps typographic punctuation in SMS", () => {
    const r = checkMessage("Meridian: We’re moving your call to 3pm — reply “1” to confirm…", sms);
    expect(r.text).toBe('Meridian: We\'re moving your call to 3pm - reply "1" to confirm...');
    expect(r.sms!.encoding).toBe("GSM-7");
  });

  it("requires an opt-out only for marketing SMS", () => {
    expect(rules("Meridian: 20% off annual plans this week. meridian.app/annual", { ...sms, kind: "marketing" })).toContain("opt-out");
    expect(rules("Meridian: 20% off annual plans this week. meridian.app/annual Reply STOP to opt out.", { ...sms, kind: "marketing" })).not.toContain("opt-out");
    expect(rules("Meridian: Your code is 482910.", sms)).not.toContain("opt-out");
  });

  it("flags long texts, placeholders and shouting but not acronyms", () => {
    expect(rules(`Meridian: ${"word ".repeat(40)}`, sms)).toContain("length");
    expect(rules("Meridian: Hi {{first_name}}, your invoice is ready.", sms)).toContain("placeholder");
    expect(rules("Meridian: Your API key and JSON export are ready. Reply STOP to opt out.", sms)).toEqual([]);
    expect(rules("Meridian: FREE upgrade today.", sms)).toContain("shouting");
  });

  it("keeps markdown in chat, and only names the sender in threads", () => {
    const r = checkMessage("**Done.** The invoice went to Maya Chen.", { channel: "chat", product: "Meridian", first: true });
    expect(r.text).toBe("**Done.** The invoice went to Maya Chen.");
    expect(r.issues).toEqual([]);
  });

  it("follows the voice setting for emoji", () => {
    expect(rules("Meridian: Shipped 🚀", { ...sms, emoji: "sparingly" })).toEqual([]);
    expect(rules("Meridian: Shipped 🚀🚀", { ...sms, emoji: "sparingly" })).toEqual(["emoji"]);
  });
});

describe("image cards", () => {
  const input = { label: "October report", title: "3 projects need a decision <this> week & next", body: "Website refresh and Billing migration are waiting.", metric: "92%", metricLabel: "on track", footer: "meridian.app" };

  for (const [name, preset] of Object.entries(presets)) {
    it(`draws ${name} at every size and mode`, () => {
      const s = buildSystem(preset);
      for (const size of Object.keys(CARD_SIZES) as (keyof typeof CARD_SIZES)[]) {
        for (const mode of ["light", "dark"] as const) {
          const svg = renderCardSvg(s, input, { size, mode });
          expect(svg.startsWith("<svg")).toBe(true);
          expect(svg).toContain(`width="${CARD_SIZES[size].width}"`);
          expect(svg).toContain("&lt;this&gt; week &amp; next");
          expect(svg).not.toMatch(/<this>|& next/);
          expect(svg.match(/<text/g)!.length).toBeGreaterThanOrEqual(5);
        }
      }
    });
  }

  it("draws the same card from an app's theme as from the system", () => {
    const s = buildSystem(presets.glass!);
    const theme = JSON.parse(JSON.stringify(buildGuardrails(s).theme));
    expect(renderCardSvg(theme, input)).toBe(renderCardSvg(s, input));
  });

  it("links the system's fonts for rendering", () => {
    const href = themeFontsHref(agentTheme(buildSystem(presets.editorial!)));
    expect(href).toContain("family=Instrument+Serif");
    expect(href).toContain("family=Instrument+Sans:wght@400;500;600");
  });
});

describe("MCP Apps adapter", () => {
  it("is in the CSS only for systems that target MCP Apps", () => {
    expect(emitCss(buildSystem({ ...presets.quiet!, surfaces: ["web-app"] }))).not.toContain("data-mcp-host");
    const css = emitCss(buildSystem({ ...presets.quiet!, surfaces: ["web-app", "mcp-apps"] }));
    for (const [role, host] of Object.entries(HOST_ROLE_MAP)) expect(css).toContain(`--${role}: var(${host}, `);
    expect(css).toContain("--radius-lg: var(--border-radius-lg, ");
    expect(css).toMatch(/:root:root\[data-mcp-host\]\.dark, :root:root\[data-mcp-host\]\[data-theme="dark"\]/);
    expect(css).not.toMatch(/--primary: var\(--color/);
  });

  it("flips the opt-in mode for dark-first systems", () => {
    const css = emitCss(buildSystem(presets.terminal!));
    expect(css).toMatch(/:root:root\[data-mcp-host\]\.light, :root:root\[data-mcp-host\]\[data-theme="light"\]/);
  });

  it("survives a Tailwind build", async () => {
    const s = buildSystem({ ...presets.glass!, surfaces: [...SURFACES] });
    const compiler = await compile(`@import "tailwindcss";\n${emitCss(s)}`, { base: tailwindDir, onDependency() {} });
    const out = compiler.build(["bg-card"]);
    expect(out).toContain(":root:root[data-mcp-host]");
    expect(out).toContain("var(--color-background-primary,");
  });

  it("ships the host helper as a lib item", () => {
    const files = emitAll(buildSystem(presets.terminal!));
    const item = JSON.parse(files["public/r/mcp-host.json"]!);
    expect(item.type).toBe("registry:lib");
    expect(item.files.map((f: { path: string }) => f.path)).toEqual(["registry/lib/mcp-host.ts"]);
    expect(item.files[0].content).toContain("export function applyHostContext");
  });
});

describe("agent surfaces in the system", () => {
  it("adds chat components when the system targets chat", () => {
    const files = emitAll(buildSystem({ ...presets.quiet!, surfaces: ["web-app", "chat"] }));
    for (const n of ["approval", "citation", "streaming-text", "file-card", "reasoning"]) expect(files[`public/r/${n}.json`], n).toBeDefined();
    expect(JSON.parse(files["public/r/approval.json"]!).meta).toEqual({ requires: ["button"] });
    const none = emitAll(buildSystem({ ...presets.quiet!, surfaces: ["web-app"] }));
    expect(none["public/r/approval.json"]).toBeUndefined();
  });

  it("writes rules for each surface into DESIGN.md", () => {
    const md = emitDesignMd(buildSystem({ ...presets.quiet!, displayName: "Meridian", surfaces: [...SURFACES] }));
    for (const h of ["## Surfaces", "### Web app", "### Marketing pages", "### Code blocks", "### In-app chat", "### Inside ChatGPT and Claude (MCP Apps)", "### iMessage and SMS"]) {
      expect(md).toContain(h);
    }
    expect(md).toContain('like "Meridian: ...".');
    const lean = emitDesignMd(buildSystem({ ...presets.quiet!, surfaces: ["web-app"] }));
    expect(lean).not.toContain("### iMessage and SMS");
  });

  it("puts the product, surfaces and theme in the guardrails", () => {
    const g = buildGuardrails(buildSystem(presets.terminal!));
    expect(g.product).toBe("Terminal");
    expect(g.surfaces).toContain("mcp-apps");
    expect(g.theme.defaultMode).toBe("dark");
    expect(g.theme.colors.dark.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(g.theme.text)).toContain("base");
  });
});
