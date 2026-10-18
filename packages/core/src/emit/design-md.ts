import { PRODUCT_MAX_STEP, TYPE_STEPS } from "../scales.js";
import type { Texture } from "../schema.js";
import type { DesignSystem } from "../system.js";
import { RULES, buildGuardrails, type RuleId } from "./guardrails.js";
import { WEIGHT_NAMES, header } from "./shared.js";

const TEXTURE_PRINCIPLES: Record<Texture, string[]> = {
  minimal: [
    "Structure comes from spacing and alignment first, hairline borders second, shadows last.",
    "One accent color. If everything is highlighted, nothing is.",
    "Flat surfaces: cards sit on the page with a border, not a heavy shadow.",
  ],
  editorial: [
    "Typography carries the design. Generous line length limits, real hierarchy, few boxes.",
    "Paper-toned background with white raised surfaces; almost no shadow.",
    "Restraint in color: the accent appears in links, focus and one primary action.",
  ],
  glass: [
    "Glass is chrome, never content: nav bars, sheets, popovers and modals only.",
    "Every glass surface has a solid fallback and passes contrast against its worst backdrop.",
    "Content sits on solid surfaces so tables, numbers and body text stay crisp.",
  ],
  tactile: [
    "Surfaces feel physical: soft shadows, larger radii, clear pressed states.",
    "Warmth over precision, but hierarchy still comes from type and space.",
    "Color is confident, used for one primary action and status, not decoration.",
  ],
  technical: [
    "Borders and alignment do the work; shadows only on floating layers.",
    "Monospace for identifiers, data, keys and anything a user might copy.",
    "Dense but never cramped: every gap comes from the spacing steps.",
  ],
};

const ROLE_USE: [string, string][] = [
  ["background / foreground", "The page and its body text."],
  ["card / card-foreground", "Grouped content on the page."],
  ["popover / popover-foreground", "Menus, popovers, tooltips, command palettes."],
  ["primary / primary-foreground", "The one main action in a view, selected states, key highlights."],
  ["secondary / secondary-foreground", "Secondary buttons and quiet fills."],
  ["muted / muted-foreground", "Subtle backgrounds; helper text, captions, placeholders, metadata."],
  ["accent / accent-foreground", "Hover and active backgrounds for rows, menu items, ghost buttons."],
  ["destructive / destructive-foreground", "Irreversible actions and error text."],
  ["success, warning (+ -foreground)", "Status fills such as badges and banners, always with a label."],
  ["border, input, ring", "Dividers and outlines; form field borders; focus rings."],
  ["overlay", "The scrim behind dialogs and sheets."],
  ["chart-1 … chart-5", "Data series, in order. chart-1 is the brand."],
  ["sidebar-*", "App navigation sidebars."],
];

export function emitDesignMd(s: DesignSystem): string {
  const g = buildGuardrails(s);
  const c = s.config;
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(
    header(s, "md"),
    "",
    `# ${c.displayName} design system`,
    "",
    c.description ? `${c.description}\n` : "",
    "Read this before writing or changing any UI. Every rule below is enforced:",
    "off-system classes don't compile, and `npx auto-design check` fails the build.",
    "Run the check after every change and fix what it reports before you finish.",
    "",
    "## Principles",
    "",
    ...TEXTURE_PRINCIPLES[c.texture].map((p) => `- ${p}`),
    `- Voice: ${c.voice.tone}`,
    "",
    "## Color",
    "",
    "Use semantic roles only, as Tailwind classes (`bg-card`, `text-muted-foreground`, `border-input`).",
    "Hex, rgb, hsl and oklch literals, Tailwind palette colors (`bg-blue-500`, `text-white`) and",
    "arbitrary color values (`text-[#333]`) are not available. Opacity modifiers on roles are fine (`bg-primary/10`).",
    "",
    "| Role | Use it for |",
    "| --- | --- |",
    ...ROLE_USE.map(([role, use]) => `| \`${role}\` | ${use} |`),
    "",
    "- One `bg-primary` action per view. Everything else is `secondary`, `outline` or `ghost`.",
    "- Status is a tinted fill with a colored dot and `text-foreground` (`<Badge variant=\"warning\">`). Solid status fills are for banners and buttons only.",
    "- `text-primary` is for links, selected states and highlighted code, never body copy.",
  );
  for (const note of s.report.notes) push(`- ${note}`);

  push("", "Contrast is checked at build time (WCAG AA, 4.5:1 for text, 3:1 for focus rings):", "");
  push("| Mode | Text | On | Ratio |", "| --- | --- | --- | --- |");
  for (const check of s.report.checks.filter((x) => x.fg === "foreground" || x.fg === "muted-foreground" || x.fg === "primary-foreground")) {
    push(`| ${check.mode} | ${check.fg} | ${check.bg} | ${check.ratio}:1 |`);
  }

  push(
    "",
    "## Type",
    "",
    `- \`font-sans\` (${s.type.fonts.sans.family}) for all UI text.`,
    `- \`font-mono\` (${s.type.fonts.mono.family}) for code, IDs, keys, numbers people copy.`,
  );
  if (s.type.fonts.display) push(`- \`font-display\` (${s.type.fonts.display.family}) for marketing headlines only.`);
  push(
    `- Weights that exist: ${s.type.weights.map((w) => `\`font-${WEIGHT_NAMES[w]}\` (${w})`).join(", ")}. No others compile.`,
    `- Product UI stops at \`text-${PRODUCT_MAX_STEP}\`. Larger steps are for marketing pages.`,
    "- Use `tabular-nums` for numbers in tables and anything that updates live.",
    "",
    "| Class | Size | Line height | Use |",
    "| --- | --- | --- | --- |",
  );
  const typeUse: Record<string, string> = {
    xs: "Badges, timestamps, fine print",
    sm: "Secondary text, table cells, labels",
    base: "Body text and inputs",
    lg: "Lead paragraphs, card titles",
    xl: "Section titles",
    "2xl": "Page titles",
    "3xl": "Dashboard headline numbers",
    "4xl": "Marketing section heads",
    "5xl": "Marketing hero",
    "6xl": "Marketing hero, large screens",
  };
  for (const step of TYPE_STEPS) {
    const v = s.type.scale[step];
    push(`| \`text-${step}\` | ${v.px}px | ${v.lineHeight} | ${typeUse[step]} |`);
  }

  push(
    "",
    "## Space, size and shape",
    "",
    `- Padding, margin, gap and space utilities use these steps only: ${g.spacing.steps.map((n) => `\`${n}\``).join(", ")} (× 4px).`,
    `- Control heights (${c.density}): small \`h-${s.controls.sm}\`, default \`h-${s.controls.md}\`, large \`h-${s.controls.lg}\`. Inputs match buttons.`,
    `- Radius: \`rounded-sm\`, \`rounded-md\`, \`rounded-lg\` (${c.shape.radius}px, the default for cards), \`rounded-xl\`, \`rounded-full\` for pills and avatars.`,
    `- Elevation: \`shadow-xs\` to \`shadow-lg\`. ${c.texture === "technical" || c.texture === "editorial" ? "Only floating layers (popovers, dialogs) use a shadow here." : "Use `shadow-lg` only for floating layers."}`,
    "",
    "## Motion",
    "",
    `Profile: **${s.motion.name}**.`,
    "",
    `- Durations that pass the check: ${g.motion.durations.map((d) => `\`duration-${d}\``).join(", ")}. Nothing longer than ${s.motion.maxDuration}ms in product UI.`,
    "- `ease-out` for things entering or responding to the user; `ease-in-out` for things moving on screen.",
    `- Entering elements use \`animate-enter\`: a fade${s.motion.enterScale < 1 ? ` from scale ${s.motion.enterScale}` : ""}${s.motion.enterDistance ? ` and ${s.motion.enterDistance}px of travel` : ""}. Never animate from \`scale-0\`.`,
    "- Decide whether an animation is needed before adding one. Frequent actions (menus, toggles, command palettes) are fast or instant; keyboard-triggered actions don't animate.",
    "- Popovers grow from their trigger, not from their center.",
    "- Reduced motion is handled globally: `--enter-scale` and `--enter-distance` neutralize, leaving fades.",
    "",
    "## Voice",
    "",
    `- ${c.voice.tone}`,
    `- ${c.voice.uiCase === "sentence" ? "Sentence case" : "Title Case"} for buttons, menu items, tabs and headings.`,
    `- ${c.voice.emoji === "never" ? "No emoji in product UI." : "Emoji sparingly, never in buttons or errors."}`,
    "- Errors say what happened and what to do next. Empty states say what will appear and how to start.",
    "",
    "## Checking your work",
    "",
    "```sh",
    "npx auto-design check            # lint the project against these rules",
    "npx auto-design check --json     # machine-readable, for agents",
    "```",
    "",
    "| Rule | Severity | What it enforces |",
    "| --- | --- | --- |",
    ...(Object.keys(RULES) as RuleId[])
      .filter((id) => g.rules[id] !== "off")
      .map((id) => `| \`${id}\` | ${g.rules[id]} | ${RULES[id].summary} |`),
    "",
    "If a rule must be broken, say so on the line before, with a reason. The check counts these:",
    "",
    "```tsx",
    "// auto-design-allow no-arbitrary-value: matches the partner logo's fixed aspect ratio",
    "```",
    "",
  );
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

export function emitDesignMdFile(s: DesignSystem): Record<string, string> {
  return { "DESIGN.md": emitDesignMd(s) };
}

