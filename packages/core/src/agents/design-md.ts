import type { DesignSystem } from "../system.js";
import { CARD_SIZES } from "./card.js";
import { MESSAGE_RULES } from "./messaging.js";

/** DESIGN.md guidance for each surface the system targets. Agents read this before building there. */
export function surfacesSection(s: DesignSystem): string[] {
  const surfaces = s.config.surfaces;
  const name = s.config.displayName;
  const lines: string[] = ["## Surfaces", "", `${name} targets: ${surfaces.join(", ")}. Rules for each:`, ""];

  if (surfaces.includes("web-app")) {
    lines.push(
      "### Web app",
      "",
      "- One page title (`text-2xl` at most), one primary action, then content. Filters and secondary actions are `outline` or `ghost`.",
      "- Tables use `tabular-nums` and right-align numbers. Empty states say what will appear and how to start.",
      "",
    );
  }
  if (surfaces.includes("marketing")) {
    lines.push(
      "### Marketing pages",
      "",
      "- `text-4xl` to `text-6xl` exist for hero and section heads here, and nowhere in product UI.",
      "- One primary call to action per section, worded as what happens (\"Start free trial\"), with the secondary as `outline`.",
      `- Link previews: og:image at ${CARD_SIZES.og.width}×${CARD_SIZES.og.height} drawn with \`npx auto-design card --size og\`, og:title under 60 characters.`,
      "",
    );
  }
  if (surfaces.includes("code")) {
    lines.push(
      "### Code blocks",
      "",
      "- Use `CodeBlock`; its syntax colors come from the brand and pass 4.5:1 in both modes.",
      "- Inline code is `font-mono` on `bg-muted`. Commands people copy go in a block, one command per line.",
      "",
    );
  }
  if (surfaces.includes("chat")) {
    lines.push(
      "### In-app chat",
      "",
      "- Assistant turns are plain text on the page (`<Message from=\"assistant\">`); user turns sit on a quiet fill. No avatars on every turn.",
      "- Stream answers with `StreamingText`. The caret is the only typing indicator; never animate individual tokens.",
      "- Tool calls collapse to one line with a status (`ToolCall`). A failed call says what failed and what happens next.",
      "- Ask before acting with `Approval`. The title names the action and its object (\"Send the invoice to Maya Chen\"); the answers are short verbs (\"Send\", \"Don't send\").",
      "- Answers that use sources cite them with `Citation` and list them with `Sources`.",
      "- Thinking goes in `Reasoning`, closed by default. Files go in `FileCard`.",
      "- Lead with the answer in a sentence or two, then the detail. Headings only for answers longer than a screen.",
      "",
    );
  }
  if (surfaces.includes("mcp-apps")) {
    lines.push(
      "### Inside ChatGPT and Claude (MCP Apps)",
      "",
      "- Call `applyHostContext()` from `@/lib/mcp-host` on connect and on every `hostcontextchanged` event. Keep `<meta name=\"color-scheme\" content=\"light dark\">` in the head and set `prefersBorder: false` on the UI resource.",
      "- Inside a host, the page background is transparent, and backgrounds, text, borders, radius and type follow the host. `bg-primary`, focus rings and charts stay on-brand. Keep using role classes; they already map.",
      "- Inline cards fit their content: no inner scrolling, at most two actions at the bottom, four or five data points. Anything bigger asks for fullscreen.",
      "- No menus, dropdowns or popovers: hosts clip them. Use segmented controls, toggles or visible options.",
      "- Carousels: 3 to 8 items of the same size, each an image, a title, up to three lines and one optional action.",
      "- Typing, follow-up questions and \"change this\" belong in the host's chat box, not in the app. Direct manipulation (select, toggle, confirm) belongs in the app.",
      "- Three text sizes (`text-lg`, `text-base`, `text-sm`) and two weights. Tap targets at least 44px on touch. Skeletons, not spinners.",
      "- Pad the root by the host's safe-area insets: `--safe-top`, `--safe-right`, `--safe-bottom`, `--safe-left`.",
      "- Check both light and dark: the host can switch while your app is open.",
      "",
    );
  }
  if (surfaces.includes("messaging")) {
    const product = name;
    lines.push(
      "### iMessage and SMS",
      "",
      "The thread belongs to the phone, so the brand travels in words and pictures. Check every message before it ships:",
      "`npx auto-design message \"<text>\" --channel sms` or the MCP tool `check_message`. Both return a fixed version.",
      "",
      ...Object.values(MESSAGE_RULES).map((r) => `- ${r.replace("Meridian", product)}`),
      `- Images: \`npx auto-design card --title "..." --metric "92%"\` draws a ${CARD_SIZES.card.width}×${CARD_SIZES.card.height} card in the system's colors and type.`,
      "",
      "```text",
      `Good: ${product}: Your October report is ready. 3 projects need a decision by Friday. https://example.com/r/oct`,
      `Bad:  Hey there!! Your **October report** is READY, check it out: https://bit.ly/x1`,
      "```",
      "",
    );
  }
  return lines;
}
