import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import {
  agentTheme,
  checkMessage,
  renderCardSvg,
  themeFontsHref,
  type CardInput,
  type CardSize,
  type MessageChannel,
  type MessageKind,
} from "@auto-design/core";
import pc from "picocolors";
import { loadContext } from "./mcp/context.js";

/** `auto-design message`: check a text against the system's voice and texting rules. */
export async function runMessage(opts: { text: string; cwd: string; channel: string; kind: string; first: boolean; json: boolean }) {
  let text = opts.text;
  if (text === "-" || !text) text = readFileSync(0, "utf8");
  const ctx = await loadContext(opts.cwd).catch(() => null);
  const report = checkMessage(text, {
    channel: opts.channel as MessageChannel,
    kind: opts.kind as MessageKind,
    first: opts.first,
    product: ctx?.guardrails.product ?? ctx?.theme?.product,
    emoji: ctx?.guardrails.voice.emoji ?? "never",
  });
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }
  for (const i of report.issues) {
    console.log(`${i.severity === "error" ? pc.red("✗") : pc.yellow("!")} ${pc.dim(i.rule.padEnd(12))} ${i.message}`);
  }
  if (report.sms) console.log(pc.dim(`SMS: ${report.sms.encoding}, ${report.sms.length} characters, ${report.sms.segments} segment${report.sms.segments > 1 ? "s" : ""}`));
  console.log(`${report.ok ? pc.green("✓ Ready to send") : pc.red("✗ Fix the errors before sending")}${report.text !== text.trim() ? ". Formatted:" : ""}`);
  if (report.text !== text.trim()) console.log(`\n${report.text}\n`);
  return report;
}

type Browser = { newPage(o?: object): Promise<Page>; close(): Promise<void> };
type Page = {
  setContent(html: string, o?: object): Promise<void>;
  goto(url: string, o?: object): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(o?: object): Promise<Buffer>;
  evaluate<T>(fn: string | ((arg: unknown) => T), arg?: unknown): Promise<T>;
  locator(sel: string): { screenshot(o?: object): Promise<Buffer> };
  setViewportSize(s: { width: number; height: number }): Promise<void>;
  emulateMedia(o: object): Promise<void>;
  on(event: string, fn: (arg: unknown) => void): void;
  close(): Promise<void>;
};

/** Playwright is optional: cards and reviews use it when it's installed. */
export async function launchBrowser(): Promise<Browser> {
  let pw: { chromium: { launch(o?: object): Promise<Browser> } };
  try {
    pw = (await import("playwright" as string)) as typeof pw;
  } catch {
    try {
      pw = (await import("playwright-core" as string)) as typeof pw;
    } catch {
      throw new Error("This needs Playwright. Install it with `npm i -D playwright && npx playwright install chromium`.");
    }
  }
  const executablePath = process.env.AUTO_DESIGN_CHROMIUM || undefined;
  return pw.chromium.launch({ executablePath });
}

/** `auto-design card`: an image card in the system's style, as SVG or PNG. */
export async function runCard(opts: CardInput & { cwd: string; size: string; mode?: string; out?: string }) {
  const ctx = await loadContext(opts.cwd);
  const theme = ctx.system ? agentTheme(ctx.system) : ctx.theme;
  if (!theme) throw new Error("This app's auto-design.json predates image cards. Run `npx auto-design add` again to refresh it.");
  const size = (["card", "og", "square"].includes(opts.size) ? opts.size : "card") as CardSize;
  const svg = renderCardSvg(theme, opts, { size, mode: opts.mode as "light" | "dark" | undefined });
  const out = resolve(opts.out ?? `card-${size}.png`);
  mkdirSync(dirname(out), { recursive: true });
  if (extname(out) === ".svg") {
    writeFileSync(out, svg);
  } else {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage({ deviceScaleFactor: 1 });
      await page.setContent(
        `<!doctype html><html><head><link rel="stylesheet" href="${themeFontsHref(theme)}"><style>html,body{margin:0}svg{display:block}</style></head><body>${svg}</body></html>`,
        { waitUntil: "networkidle" },
      );
      await page.evaluate("document.fonts.ready");
      writeFileSync(out, await page.locator("svg").screenshot({ type: extname(out) === ".jpg" ? "jpeg" : "png" }));
    } finally {
      await browser.close();
    }
  }
  console.log(`${pc.green("✓")} Wrote ${relative(process.cwd(), out)}`);
  return out;
}
