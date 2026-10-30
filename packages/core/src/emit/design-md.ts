import { PRODUCT_MAX_STEP, TYPE_STEPS } from "../scales.js";
import type { Texture } from "../schema.js";
import type { DesignSystem } from "../system.js";
import { componentSources } from "./components.js";
import { isDarkFirst } from "./css.js";
import { RULES, buildGuardrails, type RuleId } from "./guardrails.js";
import { WEIGHT_NAMES, header } from "./shared.js";
import { surfacesSection } from "../agents/design-md.js";
import { motionLanguage } from "../motion/language.js";
import { animationsFor } from "../motion/templates.js";

const TEXTURE_PRINCIPLES: Record<Texture, string[]> = {
  minimal: [
    "Structure comes from spacing and alignment first, hairline borders second, shadows last.",
    "One accent color. If everything is highlighted, nothing is.",
    "Flat surfaces: cards sit on the page with a border, not a heavy shadow.",
  ],
  editorial: [
    "Typography carries the design. Generous line length limits, real hierarchy, few boxes.",
    "A tinted page with white surfaces and no borders; almost no shadow.",
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

/**
 * How pages are composed: where photography goes, the first screen's shape, collections, labels,
 * headline scale and the logo. These are what make a reference read as itself, so agents get them as
 * rules, not as a mood.
 */
function artSection(s: DesignSystem): string[] {
  const a = s.config.art;
  const display = s.type.fonts.display ? "font-display " : "";
  const lines = ["## Art direction", ""];
  const imagery: Record<typeof a.imagery, string> = {
    none: "- No photography. Pages lead with type and the product itself (screens, objects, data). Don't add stock photos or illustration to fill space.",
    supporting:
      "- Photography supports the words: one picture beside or under the headline, product shots in collections. Real photos only (the product, its people, its places), never illustration standing in for a photo.",
    leading:
      "- Photography leads: pictures are the page and carry most of the color, so the interface around them stays quiet. Use real photos of the product and its world, large and uncropped where possible (`object-cover` in a fixed aspect), and give every photo `alt` text that says what it shows.",
  };
  lines.push(imagery[a.imagery]);
  const hero: Record<typeof a.hero, string> = {
    type: "- Landing pages open on words only: a headline, one line and the main action, left-aligned, with nothing decorative beside them.",
    centered: "- Landing pages open centered: the headline, one line and the action in the middle, with a wide picture or the product under them.",
    split: "- Landing pages open split: the words on one side, one picture or the product on the other, both the same height.",
    "full-bleed":
      "- Landing pages open full-bleed: one photo fills the first screen and the navigation and headline sit on it. Words on a photo go over the `photo-scrim` layer inside an `on-photo` element, which turns text, links and buttons light in either mode; the `Hero` component does both.",
    editorial: "- Landing pages open like a magazine: a short rule, a headline column on the left and one tall picture on the right.",
  };
  lines.push(hero[a.hero]);
  const grid: Record<typeof a.grid, string> = {
    cards: "- Collections (products, features, posts) sit in cards: `bg-card`, the system radius and border, an even grid.",
    open: "- Collections are open: pictures and captions with no boxes around them, separated by space. Captions are a name and one detail (a price, a date).",
    editorial: "- Collections are editorial: one large item beside smaller ones, never an even grid of identical cards.",
  };
  lines.push(grid[a.grid]);
  if (a.labels === "uppercase") {
    lines.push("- Navigation links, small labels and marketing buttons are uppercase and tracked: `uppercase tracking-label text-xs`. Body text, headlines and form labels stay in sentence case.");
  } else {
    lines.push("- Navigation, labels and buttons are in sentence case. Don't add tiny uppercase labels above headings.");
  }
  if (a.display === "dramatic") {
    lines.push(`- Headlines are dramatic: a landing page's headline uses \`${display}text-5xl\` or \`text-6xl\`, far above the text. Keep it to a short line or two so it never crowds the first screen.`);
  } else {
    lines.push(`- Headlines are measured: \`${display}text-4xl\` to \`text-5xl\` on landing pages, sized for the words they carry.`);
  }
  if (a.logo === "wordmark") {
    lines.push(`- The logo is a wordmark: the name alone, uppercase and widely spaced (\`${display}uppercase tracking-wordmark\`), centered in the header with the links on either side. No letter mark beside it.`);
  } else {
    lines.push("- The logo is a letter mark beside the name, on the left of the header.");
  }
  if (s.config.surfaces.includes("marketing")) {
    lines.push("- Build landing pages from `SiteHeader`, `Hero` and `Collection`: they already compose pages this way. Give them real words and real photos.");
  }
  if (s.images?.length && a.imagery !== "none") {
    lines.push("", "Photos this system ships, in `images/` (served at `/images/` on the design site). Use them until the product has its own, keep each credit visible somewhere on the site (a footer or an About page), and see `images/CREDITS.md` for licenses:", "");
    for (const img of s.images) lines.push(`- \`images/${img.file}\`${img.width && img.height ? ` (${img.width}×${img.height})` : ""}: ${img.alt}. ${img.credit}.`);
  }
  lines.push("");
  return lines;
}

/** Concrete instructions for the texture, so agents reproduce it instead of guessing. */
function textureSection(s: DesignSystem): string[] {
  const t = s.config.texture;
  const lines = ["## Texture", ""];
  if (t === "glass") {
    lines.push(
      "- `glass` is the frosted surface. Use it on chrome only: nav bars, sheets, dialogs, popovers, toasts. It falls back to a solid surface where frosting isn't supported.",
      "- Put `bg-backdrop` on the app shell so glass has something to frost. Content inside sits on solid `bg-card`.",
      "- Never put `glass` on tables, data cards, lists or body text, and keep to three glass layers in a view. The check flags glass on content.",
    );
  } else if (t === "technical") {
    lines.push(
      "- Labels, table headers and metadata: `font-mono text-xs uppercase tracking-wide text-muted-foreground`.",
      "- IDs, keys, hashes, versions, paths and commands are always `font-mono`.",
      "- Separate with `border` and spacing. No shadows except on floating layers.",
      "- `bg-grid` puts a faint dot grid behind marketing heroes, empty states and canvases. Never behind tables, forms or body text.",
    );
  } else if (t === "editorial") {
    lines.push(
      s.type.fonts.display
        ? "- Page titles and marketing headlines use `font-display font-normal`; everything else is `font-sans`."
        : "- Hierarchy comes from size and weight, not boxes.",
      "- Keep text columns to `max-w-prose`. Prefer a `border-t` and space over a card.",
      "- Cards are white on the tinted page, with no border and no shadow. Only dialogs and popovers cast a shadow.",
    );
  } else if (t === "tactile") {
    lines.push(
      "- Solid buttons are raised (`shadow-raised`: a lit top edge and a soft drop) and press down (`active:translate-y-px active:shadow-xs`); the Button component already does this.",
      "- Cards are raised with a soft shadow and no border in light mode; the Card component does this. Group with space before adding a border.",
      s.type.fonts.display ? "- Headlines use `font-display`; they carry the personality." : "- Headlines carry the personality through size and weight.",
    );
  } else {
    lines.push(
      "- Structure comes from alignment and spacing first, `border` second, `shadow-xs` last.",
      "- Cards have a hairline border and a soft `shadow-sm`; menus and toasts use `shadow-md`, dialogs `shadow-lg`. Solid buttons use `shadow-raised`; the Button component already does.",
    );
  }
  lines.push("");
  return lines;
}

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
  if (isDarkFirst(s)) {
    push('- This system loads in dark mode. Light mode is opt-in with `<html class="light">`, and `dark:` utilities apply by default.');
  }
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
  if (s.type.fonts.display) {
    const dw = s.type.fonts.display.weights.map((w) => `\`font-${WEIGHT_NAMES[w]}\``).join(" or ");
    push(`- \`font-display\` (${s.type.fonts.display.family}) for headlines at \`text-2xl\` and up, with ${dw}. Never for body text, labels or buttons.`);
  }
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
    `- Elevation: \`shadow-xs\` (controls at rest), \`shadow-sm\` (cards), \`shadow-md\` (menus, toasts), \`shadow-lg\` (dialogs) and \`shadow-raised\` (solid buttons). ${c.texture === "technical" || c.texture === "editorial" ? "Only floating layers (popovers, dialogs) use a shadow here." : "Use `shadow-lg` only for floating layers."}`,
    "",
    ...textureSection(s),
    ...artSection(s),
    "## Motion",
    "",
    `Profile: **${s.motion.name}**.`,
    "",
    `- Durations that pass the check: ${g.motion.durations.map((d) => `\`duration-${d}\``).join(", ")}. Nothing that answers a press runs longer than ${s.motion.maxDuration}ms.`,
    `- \`duration-${s.motion.reveal}\` is for reveals only: counters, charts, text and sections arriving as they scroll into view. Use \`animate-reveal\` (${s.motion.revealDistance ? `${s.motion.revealDistance}px of travel and a fade` : "a fade"}), \`animate-grow\` for bars and meters, \`animate-draw\` for lines${s.motion.stagger ? `, ${s.motion.stagger}ms between staggered items` : ""}.`,
    s.motion.ambient
      ? "- The only looping motion is `animate-marquee`, for logo strips on marketing pages. It pauses on hover and stops for reduced motion."
      : "- Nothing loops. Logo strips and tickers stand still.",
    "- `ease-out` for things entering or responding to the user; `ease-in-out` for things moving on screen.",
    `- Entering elements use \`animate-enter\`: a fade${s.motion.enterScale < 1 ? ` from scale ${s.motion.enterScale}` : ""}${s.motion.enterDistance ? ` and ${s.motion.enterDistance}px of travel` : ""}. Never animate from \`scale-0\`.`,
    "- Decide whether an animation is needed before adding one. Frequent actions (menus, toggles, command palettes) are fast or instant; keyboard-triggered actions don't animate.",
    "- Popovers grow from their trigger, not from their center.",
    "- Reduced motion is handled globally: `--enter-scale`, `--enter-distance`, `--reveal-distance` and `--stagger` neutralize, leaving fades; page transitions turn off.",
    ...motionComponentsLine(s),
    "",
    "## Brand motion",
    "",
    ...brandMotionLines(s),
    "",
    "## Voice",
    "",
    `- ${c.voice.tone}`,
    `- ${c.voice.uiCase === "sentence" ? "Sentence case" : "Title Case"} for buttons, menu items, tabs and headings.`,
    `- ${c.voice.emoji === "never" ? "No emoji in product UI." : "Emoji sparingly, never in buttons or errors."}`,
    "- Errors say what happened and what to do next. Empty states say what will appear and how to start.",
    "",
    ...surfacesSection(s),
    "## Components",
    "",
    "Use these before writing your own. They already follow every rule here. Install with",
    "`npx auto-design add <system> --components <name>` or `npx shadcn add <host>/r/<name>.json`.",
    "",
    "| Component | Use it for |",
    "| --- | --- |",
    ...componentSources(s).map((c) => `| \`${c.name}\` | ${c.description} |`),
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

/** Motion components, listed only when the system ships them. */
function motionComponentsLine(s: DesignSystem): string[] {
  const motion = ["number-ticker", "text-reveal", "reveal", "chart", "progress", "spinner", "accordion", "tooltip", "sheet", "segmented-control", "animated-list", "marquee", "hold-to-confirm", "copy-button", "page-transition"];
  const have = new Set(componentSources(s).map((c) => c.name));
  const list = motion.filter((m) => have.has(m));
  return list.length ? [`- Use the motion components before writing your own: ${list.map((m) => `\`${m}\``).join(", ")}.`] : [];
}

/** Launch films, social posts and walkthroughs, made from the same motion. */
function brandMotionLines(s: DesignSystem): string[] {
  const lang = motionLanguage(s);
  const list = animationsFor(s);
  return [
    "Launch films, social posts and product walkthroughs come from the system, not from a video editor. Don't hand-write animation code for them:",
    "render one of these with `npx auto-design animate <id> --out file.mp4` (or the MCP tool `render_animation`), in the product's own words.",
    "",
    ...list.map((a) => `- \`${a.id}\`: ${a.description}`),
    "",
    `- Brand motion is slower and larger than product UI: entrances take ${lang.beat}ms${lang.travel ? ` and rise ${lang.travel}% of the frame` : " and only fade"}, items arrive ${lang.stagger}ms apart, and each scene holds ${lang.hold}ms before the next.`,
    `- One idea per scene. Words come from the product (specimen.copy.json); pass your own with flags like \`--title\`.`,
    "- Formats: landscape (1920×1080) for sites and decks, square (1080×1080) for social posts, portrait (1080×1920) for stories.",
  ];
}

export function emitDesignMdFile(s: DesignSystem): Record<string, string> {
  return { "DESIGN.md": emitDesignMd(s) };
}

