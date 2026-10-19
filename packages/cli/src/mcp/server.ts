import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { check, checkSource } from "@auto-design/check";
import { CARD_SIZES, MESSAGE_RULES, checkMessage, renderCardSvg, type CardSize, type MessageChannel, type MessageKind } from "@auto-design/core";
import { loadContext, section, sections, type Context } from "./context.js";

/**
 * `auto-design mcp`: the design system as tools for coding agents, over the
 * Model Context Protocol (stdio, newline-delimited JSON-RPC). No SDK: the
 * subset a tools-and-resources server needs is small, and it keeps the CLI
 * dependency-free.
 */

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

type Json = Record<string, unknown>;
interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Json;
  isError?: boolean;
}

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations?: Json;
  run(args: Json, ctx: Context): Promise<ToolResult>;
}

const text = (t: string, structured?: Json): ToolResult => ({ content: [{ type: "text", text: t }], ...(structured ? { structuredContent: structured } : {}) });
const fail = (t: string): ToolResult => ({ content: [{ type: "text", text: t }], isError: true });
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

const readOnly = { readOnlyHint: true, openWorldHint: false };

export const TOOLS: Tool[] = [
  {
    name: "get_rules",
    title: "Design system rules",
    description:
      "Read before writing or changing any UI. Returns the design system's DESIGN.md: color roles, type, spacing, texture, motion, voice, the rules for each surface (web app, marketing, chat, MCP Apps, iMessage and SMS) and the components to use. Pass `section` for one part, e.g. \"color\", \"motion\", \"chat\", \"imessage\", \"components\".",
    inputSchema: { type: "object", properties: { section: { type: "string", description: "A section heading or keyword. Omit for the whole document." } }, additionalProperties: false },
    annotations: readOnly,
    async run(args, ctx) {
      if (!ctx.designMd) return fail("This project has no DESIGN.md. Rebuild the system or run `npx auto-design add` again.");
      const name = str(args.section);
      if (!name) return text(ctx.designMd);
      const found = section(ctx.designMd, name);
      if (found) return text(found);
      const headings = sections(ctx.designMd).map((s) => s.heading);
      return fail(`No section matches "${name}". Sections: ${headings.join(", ")}.`);
    },
  },
  {
    name: "get_tokens",
    title: "Design tokens",
    description:
      "The system's color roles with their light and dark values, and the type, spacing, radius, shadow and motion scales. Use role names as Tailwind classes (bg-card, text-muted-foreground, border-input); never copy the raw values into code.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: readOnly,
    async run(_args, ctx) {
      const g = ctx.guardrails;
      const out = {
        system: g.system,
        product: g.product ?? ctx.theme?.product,
        texture: g.texture,
        defaultMode: ctx.theme?.defaultMode ?? "light",
        colors: ctx.theme?.colors ?? { roles: g.colors.roles },
        fonts: Object.fromEntries(g.fonts.families.map((f, i) => [f, { class: `font-${f}`, family: g.fonts.cssFamilies[i] }])),
        weights: Object.fromEntries(Object.entries(g.weights).map(([n, w]) => [`font-${n}`, w])),
        text: { classes: g.text.steps.map((s) => `text-${s}`), productMax: `text-${g.text.productMax}` },
        spacing: { steps: g.spacing.steps, note: "Multiples of 4px: p-4 is 16px." },
        radius: g.radius.steps.map((s) => `rounded-${s}`),
        shadow: g.shadow.steps.map((s) => `shadow-${s}`),
        motion: { durations: g.motion.durations.map((d) => `duration-${d}`), easings: g.motion.easings.map((e) => `ease-${e}`), enter: "animate-enter", maxDuration: g.motion.maxDuration },
      };
      return text(JSON.stringify(out, null, 2), out);
    },
  },
  {
    name: "list_components",
    title: "List components",
    description: "Components the system provides, already styled to its rules. Use these before writing your own.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: readOnly,
    async run(_args, ctx) {
      const list = await ctx.components();
      const install = ctx.kind === "app" && ctx.guardrails.registry ? `npx auto-design add ${ctx.guardrails.registry} --components <name>` : "npx auto-design add <system> --components <name>";
      const lines = list.map((c) => `- ${c.name}${c.installed ? " (installed)" : ""}${c.description ? `: ${c.description}` : ""}`);
      return text(`${lines.join("\n")}\n\nInstall: ${install}`, { components: list, install });
    },
  },
  {
    name: "get_component",
    title: "Get a component",
    description: "The source of one component, to read its props and variants, or to install it by hand.",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "Component name, e.g. button or approval." } }, required: ["name"], additionalProperties: false },
    annotations: readOnly,
    async run(args, ctx) {
      const name = str(args.name);
      if (!name) return fail("Pass a component name.");
      const c = await ctx.component(name);
      if (!c) return fail(`No component named "${name}". Call list_components for the names.`);
      return text(c.files.map((f) => `// ${f.path}\n${f.content}`).join("\n\n"), c as unknown as Json);
    },
  },
  {
    name: "check_code",
    title: "Check code",
    description:
      "Check TSX, JSX, TS or CSS against the system's guardrails: colors, type, spacing, radius, shadows, motion, texture and voice. Pass `code` and `filename` to check code before writing it, or `paths` (globs relative to the project) to check files on disk. With neither, checks the whole project. Fix every error before finishing.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Source to check." },
        filename: { type: "string", description: "Its file name, which picks the parser (e.g. page.tsx or styles.css). Default component.tsx." },
        paths: { type: "array", items: { type: "string" }, description: "Glob patterns relative to the project root." },
      },
      additionalProperties: false,
    },
    annotations: readOnly,
    async run(args, ctx) {
      const code = str(args.code);
      if (code !== undefined) {
        const filename = str(args.filename) ?? "component.tsx";
        const r = checkSource(code, filename, ctx.guardrails);
        const errors = r.violations.filter((v) => v.severity === "error").length;
        const summary = r.violations.length
          ? r.violations.map((v) => `${v.line}:${v.column} ${v.severity} ${v.rule}: ${v.message}`).join("\n")
          : "No violations.";
        return text(`${summary}\n\n${errors} errors, ${r.violations.length - errors} warnings.`, { violations: r.violations, allowances: r.allowances, errors });
      }
      // Globs stay inside the project.
      const patterns = Array.isArray(args.paths) ? args.paths.filter((p): p is string => typeof p === "string" && !p.split(/[\\/]/).includes("..") && !/^([a-z]:)?[\\/]/i.test(p)) : undefined;
      const r = await check({ cwd: ctx.root, guardrails: ctx.guardrails, patterns: patterns?.length ? patterns : undefined });
      const summary = r.violations.length
        ? r.violations.slice(0, 200).map((v) => `${v.file}:${v.line}:${v.column} ${v.severity} ${v.rule}: ${v.message}`).join("\n")
        : "No violations.";
      return text(`${summary}\n\n${r.files} files, ${r.errors} errors, ${r.warnings} warnings.`, r as unknown as Json);
    },
  },
  {
    name: "check_message",
    title: "Check a text message",
    description:
      "Check an iMessage, SMS, RCS or chat message against the system's voice and texting rules, and get it back formatted for the channel: markdown removed, plain punctuation for SMS, emoji dropped if the voice uses none. Reports SMS encoding and segment count. Rules: " +
      Object.values(MESSAGE_RULES).join(" "),
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        channel: { type: "string", enum: ["sms", "imessage", "rcs", "chat"], description: "Default sms." },
        kind: { type: "string", enum: ["transactional", "marketing", "conversational"], description: "Marketing SMS needs an opt-out line. Default transactional." },
        first: { type: "boolean", description: "The first message in a thread must name the sender." },
      },
      required: ["text"],
      additionalProperties: false,
    },
    annotations: readOnly,
    async run(args, ctx) {
      const t = str(args.text);
      if (!t) return fail("Pass the message text.");
      const report = checkMessage(t, {
        channel: (str(args.channel) as MessageChannel) ?? "sms",
        kind: (str(args.kind) as MessageKind) ?? "transactional",
        first: args.first === true,
        product: ctx.guardrails.product ?? ctx.theme?.product,
        emoji: ctx.guardrails.voice.emoji,
      });
      const lines = [
        report.ok ? "Ready to send." : "Fix the errors before sending.",
        ...report.issues.map((i) => `- ${i.severity} ${i.rule}: ${i.message}`),
        report.sms ? `SMS: ${report.sms.encoding}, ${report.sms.length} characters, ${report.sms.segments} segment${report.sms.segments > 1 ? "s" : ""}.` : "",
        "",
        "Formatted:",
        report.text,
      ].filter((l, i) => l !== "" || i > 0);
      return text(lines.join("\n"), report as unknown as Json);
    },
  },
  {
    name: "render_card",
    title: "Render an image card",
    description:
      `Draw an image card in the system's colors, type and texture, for places the system can't style: an iMessage or SMS thread, a link preview, a social post. Sizes: ${Object.entries(CARD_SIZES).map(([k, v]) => `${k} (${v.width}×${v.height}): ${v.use}`).join(" ")} Returns SVG; pass \`out\` to save it in the project.`,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The one thing the card says. Under 60 characters reads best." },
        body: { type: "string" },
        metric: { type: "string", description: "A number to lead with, like 92% or $48,200." },
        metricLabel: { type: "string" },
        label: { type: "string", description: "A short label above the title." },
        footer: { type: "string", description: "Usually your domain." },
        size: { type: "string", enum: ["card", "og", "square"] },
        mode: { type: "string", enum: ["light", "dark"] },
        out: { type: "string", description: "Save to this .svg path, relative to the project root." },
      },
      required: ["title"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const theme = ctx.system ?? ctx.theme;
      if (!theme) return fail("This app's auto-design.json predates image cards. Run `npx auto-design add` again to refresh it.");
      const title = str(args.title);
      if (!title) return fail("Pass a title.");
      const svg = renderCardSvg(
        theme,
        { title, body: str(args.body), metric: str(args.metric), metricLabel: str(args.metricLabel), label: str(args.label), footer: str(args.footer) },
        { size: (str(args.size) as CardSize) ?? "card", mode: str(args.mode) as "light" | "dark" | undefined },
      );
      const out = str(args.out);
      if (out) {
        const path = resolve(ctx.root, out.endsWith(".svg") ? out : `${out}.svg`);
        if (!path.startsWith(ctx.root + sep)) return fail("`out` must be inside the project.");
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, svg);
        return text(`Saved ${relative(ctx.root, path)}. For a PNG (texts and link previews need one), run: npx auto-design card --title ${JSON.stringify(title)} --out ${relative(ctx.root, path).replace(/\.svg$/, ".png")}`, { path, svg });
      }
      return text(svg, { svg });
    },
  },
  {
    name: "list_animations",
    title: "List brand animations",
    description:
      "Brand animations the system can make from its own colors, type and motion: logo reveals, announcements, metrics, charts, product walkthroughs, agent conversations, feature lists, end cards and a composed launch video. Each has fields for its words.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run(_args, ctx) {
      const { systemForMotion } = await import("../animate.js");
      const { s, copy } = await systemForMotion(ctx.root).catch(() => ({ s: null, copy: null }));
      if (!s || !copy) return fail("Animations need the design system itself: run the MCP server in the system repo, or in an app that installed it from a local folder.");
      const { animationsFor, animationDefaults, renderAnimation } = await import("@auto-design/core");
      const list = animationsFor(s).map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        seconds: a.loop ? null : renderAnimation(s, a.id, { copy }).duration / 1000,
        fields: a.fields.map((f) => ({ key: f.key, label: f.label, list: f.kind === "list", default: animationDefaults(a.id, s, copy)[f.key] ?? null })),
      }));
      return text(list.map((a) => `${a.id}: ${a.description} Fields: ${a.fields.map((f) => f.key).join(", ")}.`).join("\n"), { animations: list } as unknown as Json);
    },
  },
  {
    name: "render_animation",
    title: "Render a brand animation",
    description:
      "Render one of the system's brand animations with your words, to a file in the project: .mp4, .webm or .gif (needs ffmpeg and Playwright), .html (plays in any browser), or a .png of the last frame. Formats: landscape 1920×1080, square 1080×1080, portrait 1080×1920. Call list_animations for ids and fields.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Animation id, e.g. announcement or launch." },
        props: { type: "object", description: "Words by field key. Lists are arrays of strings.", additionalProperties: true },
        format: { type: "string", enum: ["landscape", "square", "portrait"] },
        mode: { type: "string", enum: ["light", "dark"] },
        out: { type: "string", description: "Path relative to the project root. Defaults to .auto-design/animations/<id>.html." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const id = str(args.id);
      if (!id) return fail("Pass an animation id. Call list_animations for them.");
      const out = str(args.out) ?? `.auto-design/animations/${id}.html`;
      const path = resolve(ctx.root, out);
      if (!path.startsWith(ctx.root + sep)) return fail("`out` must be inside the project.");
      const raw = (args.props && typeof args.props === "object" ? args.props : {}) as Record<string, unknown>;
      const flags = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.map(String).join("|") : String(v)]));
      try {
        const { runAnimate } = await import("../animate.js");
        const r = await runAnimate({ cwd: ctx.root, id, format: str(args.format), mode: str(args.mode), out: path, props: flags, quiet: true });
        const where = r.out ? relative(ctx.root, r.out) : "";
        return text(`${r.note ? `${r.note} ` : ""}Saved ${where} (${(r.duration / 1000).toFixed(1)}s).`, { path: r.out, kind: r.kind, seconds: r.duration / 1000 } as unknown as Json);
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  },
];

const INSTRUCTIONS =
  "This project has a design system with hard guardrails. Before writing or changing UI, call get_rules (or read DESIGN.md) and use list_components. " +
  "Use semantic role classes (bg-card, text-muted-foreground) and the system's scales only. After writing UI, call check_code and fix every error. " +
  "Before sending any iMessage, SMS or chat copy, call check_message and use its formatted text. " +
  "For launch videos, social posts and product walkthroughs, use list_animations and render_animation instead of writing animation code.";

export async function handle(msg: Json, cwd: string): Promise<Json | null> {
  const id = msg.id as string | number | undefined;
  const method = msg.method as string | undefined;
  const params = (msg.params ?? {}) as Json;
  const isRequest = id !== undefined && id !== null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

  if (typeof method !== "string") return isRequest ? err(-32600, "Invalid request") : null;
  if (!isRequest) return null; // Notifications (initialized, cancelled) need no answer.

  try {
    switch (method) {
      case "initialize": {
        const asked = str(params.protocolVersion);
        return ok({
          protocolVersion: asked && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
          serverInfo: { name: "auto-design", title: "auto-design", version: "0.1.0" },
          instructions: INSTRUCTIONS,
        });
      }
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: TOOLS.map(({ run: _r, ...t }) => t) });
      case "tools/call": {
        const tool = TOOLS.find((t) => t.name === params.name);
        if (!tool) return err(-32602, `Unknown tool: ${String(params.name)}`);
        try {
          const ctx = await loadContext(cwd);
          return ok(await tool.run((params.arguments ?? {}) as Json, ctx));
        } catch (e) {
          return ok(fail(e instanceof Error ? e.message : String(e)));
        }
      }
      case "resources/list": {
        const ctx = await loadContext(cwd).catch(() => null);
        if (!ctx) return ok({ resources: [] });
        return ok({
          resources: [
            { uri: "design://DESIGN.md", name: "DESIGN.md", title: `${ctx.guardrails.product ?? ctx.guardrails.system} design rules`, mimeType: "text/markdown", description: "The rules agents follow when writing UI." },
            { uri: "design://guardrails.json", name: "guardrails.json", title: "Guardrails", mimeType: "application/json", description: "What `auto-design check` enforces." },
          ],
        });
      }
      case "resources/templates/list":
        return ok({ resourceTemplates: [] });
      case "resources/read": {
        const ctx = await loadContext(cwd);
        if (params.uri === "design://DESIGN.md") return ok({ contents: [{ uri: params.uri, mimeType: "text/markdown", text: ctx.designMd }] });
        if (params.uri === "design://guardrails.json") return ok({ contents: [{ uri: params.uri, mimeType: "application/json", text: JSON.stringify(ctx.guardrails, null, 2) }] });
        return err(-32002, `Resource not found: ${String(params.uri)}`);
      }
      case "prompts/list":
        return ok({ prompts: [] });
      default:
        return err(-32601, `Method not found: ${method}`);
    }
  } catch (e) {
    return err(-32603, e instanceof Error ? e.message : String(e));
  }
}

export async function runMcp(opts: { cwd: string }) {
  const cwd = resolve(opts.cwd);
  // stdout is the protocol channel: anything else printed there would corrupt it.
  console.log = (...a: unknown[]) => console.error(...a);
  console.info = console.log;
  const write = (m: Json) => process.stdout.write(JSON.stringify(m) + "\n");
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const pending = new Set<Promise<void>>();
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    const batch = Array.isArray(msg) ? msg : [msg];
    for (const m of batch) {
      const p = handle(m as Json, cwd).then((res) => {
        if (res) write(res);
      });
      pending.add(p);
      p.finally(() => pending.delete(p));
    }
  });
  await new Promise<void>((done) => rl.on("close", done));
  await Promise.all(pending);
}
