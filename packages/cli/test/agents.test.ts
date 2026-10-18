import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildGuardrails, buildSystem, emitAll, emitDesignMd } from "@auto-design/core";
import { critique, rulesForReview, setMockHandler } from "@auto-design/ai";
import { presets } from "@auto-design/presets";
import { configSource, writeFiles } from "../src/commands.js";
import { registerMcp, runAdd } from "../src/add.js";
import { section } from "../src/mcp/context.js";
import { handle } from "../src/mcp/server.js";
import { loadLocalEnv, modelFromEnv, reportMarkdown } from "../src/review/review.js";

const tmp = () => mkdtempSync(join(tmpdir(), "ad-agents-"));

/** A system repo on disk: config plus everything the build writes. */
function systemRepo() {
  const dir = tmp();
  const config = { ...presets.quiet!, displayName: "Meridian", surfaces: ["web-app", "chat", "messaging", "mcp-apps"] as never };
  writeFiles(dir, { "design.config.ts": configSource(config), ...emitAll(buildSystem(config)) });
  return dir;
}

let id = 0;
async function rpc(cwd: string, method: string, params: Record<string, unknown> = {}) {
  const res = (await handle({ jsonrpc: "2.0", id: ++id, method, params }, cwd)) as { result?: any; error?: any };
  return res;
}
const tool = async (cwd: string, name: string, args: Record<string, unknown> = {}) => (await rpc(cwd, "tools/call", { name, arguments: args })).result;

describe("MCP server", () => {
  const repo = systemRepo();

  it("negotiates the protocol and lists its tools", async () => {
    const init = await rpc(repo, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.capabilities.tools).toBeDefined();
    expect(init.result.instructions).toContain("check_code");
    const old = await rpc(repo, "initialize", { protocolVersion: "1999-01-01" });
    expect(old.result.protocolVersion).toBe("2025-11-25");
    const tools = await rpc(repo, "tools/list");
    expect(tools.result.tools.map((t: { name: string }) => t.name)).toEqual(["get_rules", "get_tokens", "list_components", "get_component", "check_code", "check_message", "render_card"]);
    for (const t of tools.result.tools) expect(t.inputSchema.type).toBe("object");
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }, repo)).toBeNull();
    expect((await rpc(repo, "nope")).error.code).toBe(-32601);
  });

  it("serves rules by section", async () => {
    const all = await tool(repo, "get_rules");
    expect(all.content[0].text).toContain("# Meridian design system");
    const sms = await tool(repo, "get_rules", { section: "imessage" });
    expect(sms.content[0].text.startsWith("### iMessage and SMS")).toBe(true);
    const bad = await tool(repo, "get_rules", { section: "zzz" });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toContain("Sections:");
  });

  it("checks code in memory and on disk", async () => {
    const r = await tool(repo, "check_code", { code: 'export const A = () => <div className="bg-blue-500 p-[13px]">Hi</div>;', filename: "a.tsx" });
    expect(r.structuredContent.errors).toBe(2);
    const clean = await tool(repo, "check_code", { code: 'export const A = () => <div className="bg-card p-4">Hi</div>;' });
    expect(clean.structuredContent.errors).toBe(0);
    const disk = await tool(repo, "check_code", { paths: ["registry/ui/*.tsx"] });
    expect(disk.structuredContent.errors).toBe(0);
    expect(disk.structuredContent.files).toBeGreaterThan(10);
  });

  it("checks messages with the product as sender", async () => {
    const r = await tool(repo, "check_message", { text: "Your report is ready.", first: true });
    expect(r.structuredContent.issues.map((i: { rule: string }) => i.rule)).toEqual(["sender"]);
    expect(r.content[0].text).toContain('"Meridian: "');
  });

  it("renders cards, and only saves them inside the project", async () => {
    const r = await tool(repo, "render_card", { title: "Deploy finished", out: "cards/deploy" });
    expect(existsSync(join(repo, "cards/deploy.svg"))).toBe(true);
    expect(r.structuredContent.svg).toContain("Deploy finished");
    const escape = await tool(repo, "render_card", { title: "x", out: "../outside.svg" });
    expect(escape.isError).toBe(true);
  });

  it("lists components, tokens and resources", async () => {
    const list = await tool(repo, "list_components");
    const names = list.structuredContent.components.map((c: { name: string }) => c.name);
    expect(names).toEqual(expect.arrayContaining(["button", "approval", "streaming-text", "mcp-host"]));
    const comp = await tool(repo, "get_component", { name: "mcp-host" });
    expect(comp.content[0].text).toContain("applyHostContext");
    const tokens = await tool(repo, "get_tokens");
    expect(tokens.structuredContent.colors.light.primary).toMatch(/^#/);
    const res = await rpc(repo, "resources/read", { uri: "design://DESIGN.md" });
    expect(res.result.contents[0].text).toContain("## Surfaces");
  });

  it("works in an app that installed the system", async () => {
    const app = tmp();
    const s = buildSystem({ ...presets.quiet!, displayName: "Meridian", surfaces: ["web-app", "chat"] });
    writeFileSync(join(app, "auto-design.json"), JSON.stringify({ ...buildGuardrails(s), registry: repo }));
    writeFileSync(join(app, "DESIGN.md"), emitDesignMd(s));
    mkdirSync(join(app, "components/ui"), { recursive: true });
    writeFileSync(join(app, "components/ui/button.tsx"), "export const Button = () => null;\n");
    const list = await tool(app, "list_components");
    const button = list.structuredContent.components.find((c: { name: string }) => c.name === "button");
    expect(button.installed).toBe(true);
    expect(list.structuredContent.components.find((c: { name: string }) => c.name === "approval").installed).toBe(false);
    const approval = await tool(app, "get_component", { name: "approval" });
    expect(approval.content[0].text).toContain("function Approval");
    const local = await tool(app, "get_component", { name: "button" });
    expect(local.content[0].text).toContain("export const Button = () => null;");
    const card = await tool(app, "render_card", { title: "From the app" });
    expect(card.isError).toBeUndefined();
  });

  it("explains when there's no system", async () => {
    const r = await tool(tmp(), "get_rules");
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("No design system found");
  });
});

describe("DESIGN.md sections", () => {
  const md = "# T\n\n## Color\n\nc\n\n## Surfaces\n\nintro\n\n### In-app chat\n\nchat rules\n\n### iMessage and SMS\n\nsms rules\n\n## Components\n\nlist";
  it("finds sections by loose names and includes subsections", () => {
    expect(section(md, "colors")).toBe("## Color\n\nc");
    expect(section(md, "messaging")).toBe("### iMessage and SMS\n\nsms rules");
    expect(section(md, "surfaces")).toContain("chat rules");
    expect(section(md, "surfaces")).not.toContain("## Components");
    expect(section(md, "chat")).toBe("### In-app chat\n\nchat rules");
  });
});

describe("add for agents", () => {
  it("registers the MCP server without touching other servers", () => {
    const app = tmp();
    writeFileSync(join(app, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    mkdirSync(join(app, ".cursor"));
    expect(registerMcp(app).length).toBe(2);
    const json = JSON.parse(readFileSync(join(app, ".mcp.json"), "utf8"));
    expect(Object.keys(json.mcpServers)).toEqual(["other", "auto-design"]);
    expect(JSON.parse(readFileSync(join(app, ".cursor/mcp.json"), "utf8")).mcpServers["auto-design"].args).toEqual(["auto-design", "mcp"]);
    expect(registerMcp(app)).toEqual([]);
  });

  it("installs in-system requirements and remembers the source", async () => {
    const repo = systemRepo();
    const app = tmp();
    mkdirSync(join(app, "app"));
    writeFileSync(join(app, "app/globals.css"), '@import "tailwindcss";\n');
    writeFileSync(join(app, "package.json"), "{}");
    const log = console.log;
    console.log = () => {};
    try {
      await runAdd({ source: repo, cwd: app, components: ["approval"], install: false });
    } finally {
      console.log = log;
    }
    expect(existsSync(join(app, "components/ui/approval.tsx"))).toBe(true);
    expect(existsSync(join(app, "components/ui/button.tsx"))).toBe(true);
    const guard = JSON.parse(readFileSync(join(app, "auto-design.json"), "utf8"));
    expect(guard.registry).toMatch(/ad-agents-/);
    expect(guard.theme.product).toBe("Meridian");
    expect(existsSync(join(app, ".mcp.json"))).toBe(true);
  });
});

describe("review", () => {
  afterEach(() => setMockHandler(null));

  it("reads keys from .env.local without overriding the environment", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".env.local"), 'AD_TEST_A="from file"\nAD_TEST_B=file\n# comment\n');
    process.env.AD_TEST_B = "env";
    loadLocalEnv(dir);
    expect(process.env.AD_TEST_A).toBe("from file");
    expect(process.env.AD_TEST_B).toBe("env");
    delete process.env.AD_TEST_A;
    delete process.env.AD_TEST_B;
  });

  it("picks the configured provider", () => {
    const saved = { ...process.env };
    process.env.OPENAI_API_KEY = "sk-o";
    process.env.ANTHROPIC_API_KEY = "sk-a";
    process.env.AUTO_DESIGN_PROVIDER = "openai";
    expect(modelFromEnv()).toMatchObject({ provider: "openai", apiKey: "sk-o" });
    delete process.env.AUTO_DESIGN_PROVIDER;
    expect(modelFromEnv()!.provider).toBe("anthropic");
    process.env = saved;
  });

  it("asks the model for a critique with screenshots and the measured findings", async () => {
    let seen: any;
    setMockHandler((req) => {
      seen = req;
      return { summary: "Clear hierarchy.", verdict: "nonsense", issues: Array.from({ length: 14 }, (_, i) => ({ severity: "low", screen: "/", area: `a${i}`, problem: "p", fix: "f" })) };
    });
    const c = await critique({ provider: "mock", apiKey: "" }, { product: "Meridian", rules: "## Voice\n- calm", screens: [{ label: "/ @ 1280px light", png: Buffer.from([1, 2, 3]) }], measured: ["contrast: low"] });
    expect(c.verdict).toBe("polish");
    expect(c.issues.length).toBe(10);
    expect(seen.content.some((p: { type: string }) => p.type === "image")).toBe(true);
    expect(JSON.stringify(seen.content)).toContain("contrast: low");
  });

  it("keeps only the judging sections of DESIGN.md", () => {
    const md = emitDesignMd(buildSystem({ ...presets.quiet!, surfaces: ["web-app", "chat"] }));
    const r = rulesForReview(md);
    expect(r).toContain("## Voice");
    expect(r).toContain("### In-app chat");
    expect(r).not.toContain("## Checking your work");
    expect(r).not.toContain("| Mode | Text | On | Ratio |");
  });

  it("writes a PR-ready report", () => {
    const md = reportMarkdown(
      {
        product: "Meridian",
        screens: [{ label: "/ @ 390px light", url: "http://x/", width: 390, mode: "light", file: "a.png", findings: [], errors: [] }],
        measured: [{ rule: "contrast", severity: "error", message: "Text contrast 3.1:1, below 4.5:1.", where: ['p "a|b"'], count: 2, screens: ["/ @ 390px light"] }],
        critique: { summary: "Mostly on-system.", verdict: "polish", issues: [{ severity: "medium", screen: "/", area: "header", problem: "Two primary buttons.", fix: "Make one outline." }] },
        critiqueNote: "",
        errors: 1,
        warnings: 0,
      },
      ".auto-design/review",
    );
    expect(md.startsWith("<!-- auto-design-review -->")).toBe(true);
    expect(md).toContain("**Needs polish.** Mostly on-system.");
    expect(md).toContain("| medium | / | header | Two primary buttons. | Make one outline. |");
    expect(md).toContain("`p \"a\\|b\"`");
    expect(md).toContain("1 screen: / at 390px, light.");
  });
});
