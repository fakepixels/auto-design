import type { DesignSystem } from "../system.js";
import { agentTheme, type AgentTheme } from "./theme.js";

/**
 * Image cards for places the system can't style: an iMessage or SMS thread,
 * a link preview, a social post. The brand travels as a picture, drawn from
 * the same tokens as the product, so a texted report looks like the app.
 */

export type CardSize = "card" | "og" | "square";

export const CARD_SIZES: Record<CardSize, { width: number; height: number; use: string }> = {
  card: { width: 1200, height: 800, use: "An image sent in a text thread (3:2)." },
  og: { width: 1200, height: 630, use: "A link preview (og:image) in iMessage, Slack and social apps." },
  square: { width: 1080, height: 1080, use: "A square post or a thread image that should fill the bubble." },
};

export interface CardInput {
  /** The one thing the card says. Under 60 characters reads best. */
  title: string;
  /** A sentence of context. */
  body?: string;
  /** A number to lead with, like "92%" or "$48,200". */
  metric?: string;
  /** What the number is, like "On track". */
  metricLabel?: string;
  /** A short label above the title, like the report name. */
  label?: string;
  /** Bottom-right: usually your domain. */
  footer?: string;
}

export interface CardOptions {
  size?: CardSize;
  mode?: "light" | "dark";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Greedy wrap by estimated glyph width. Good enough for headlines; the size steps down when it isn't. */
function wrap(text: string, maxWidth: number, size: number, widthFactor: number, maxLines: number): string[] | null {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  const fits = (t: string) => t.length * size * widthFactor <= maxWidth;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (fits(next)) line = next;
    else {
      if (!line) return null;
      lines.push(line);
      line = w;
      if (!fits(line)) return null;
    }
  }
  if (line) lines.push(line);
  return lines.length <= maxLines ? lines : null;
}

function fitText(text: string, maxWidth: number, sizes: number[], widthFactor: number, maxLines: number) {
  for (const size of sizes) {
    const lines = wrap(text, maxWidth, size, widthFactor, maxLines);
    if (lines) return { size, lines };
  }
  const size = sizes.at(-1)!;
  const all = wrap(text, maxWidth, size, widthFactor, 99) ?? [text];
  const lines = all.slice(0, maxLines);
  if (all.length > maxLines) lines[maxLines - 1] = lines[maxLines - 1]!.replace(/\s*\S*$/, "") + "…";
  return { size, lines };
}

const family = (f: { family: string; fallback: string[] }) => [f.family, ...f.fallback].map((x) => (/\s/.test(x) && !/^ui-/.test(x) ? `'${x}'` : x)).join(", ");

/** An SVG image card in the system's colors, type and texture. Takes a built system or an app's agent theme. */
export function renderCardSvg(system: DesignSystem | AgentTheme, input: CardInput, opts: CardOptions = {}): string {
  const t = "palettes" in system ? agentTheme(system) : system;
  const { width: W, height: H } = CARD_SIZES[opts.size ?? "card"];
  const mode = opts.mode ?? t.defaultMode;
  const r = t.colors[mode]!;
  // Opaque hex: drop an alpha channel if a role has one.
  const hex = (c: string) => c.slice(0, 7);
  const texture = t.texture;
  const fonts = t.fonts;
  const display = fonts.display ?? fonts.sans;
  const titleWeight = fonts.display ? Math.max(...fonts.display.weights) : Math.max(...fonts.sans.weights.filter((w) => w <= 600));
  const medium = fonts.sans.weights.includes(500) ? 500 : fonts.sans.weights[0];
  const radius = Math.min(t.radius * 2, 40);
  const pad = Math.round(W * 0.067);
  const brand = t.brand;
  const bg = texture === "editorial" || texture === "tactile" ? hex(r.muted!) : hex(r.background!);
  const surface = hex(r.card!);
  const fg = hex(r.foreground!);
  const muted = hex(r["muted-foreground"]!);
  const primary = hex(r.primary!);
  const border = hex(r.border!);
  const isMono = texture === "technical";
  const labelFamily = isMono ? family(fonts.mono) : family(fonts.sans);
  // Serif display faces are narrower than grotesques.
  const titleFactor = fonts.display?.family.includes("Serif") ? 0.44 : 0.53;

  // The panel the content sits on: inset for raised textures, the whole card otherwise.
  const inset = texture === "tactile" || texture === "glass" ? Math.round(pad * 0.55) : 0;
  const px = inset;
  const py = inset;
  const pw = W - inset * 2;
  const ph = H - inset * 2;
  const cx = px + pad;
  const contentW = pw - pad * 2;

  const defs: string[] = [];
  const back: string[] = [`<rect width="${W}" height="${H}" fill="${bg}"/>`];
  if (texture === "glass") {
    defs.push(
      `<radialGradient id="g1" cx="0.15" cy="0.1" r="0.7"><stop offset="0" stop-color="${hex(brand[mode === "dark" ? "700" : "200"]!)}" stop-opacity="0.9"/><stop offset="1" stop-color="${bg}" stop-opacity="0"/></radialGradient>`,
      `<radialGradient id="g2" cx="0.9" cy="0.95" r="0.6"><stop offset="0" stop-color="${hex(brand[mode === "dark" ? "800" : "300"]!)}" stop-opacity="0.7"/><stop offset="1" stop-color="${bg}" stop-opacity="0"/></radialGradient>`,
    );
    back.push(`<rect width="${W}" height="${H}" fill="url(#g1)"/>`, `<rect width="${W}" height="${H}" fill="url(#g2)"/>`);
  }
  if (texture === "tactile" || texture === "glass") {
    defs.push(`<filter id="lift" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="${texture === "tactile" ? 10 : 6}" stdDeviation="${texture === "tactile" ? 18 : 24}" flood-color="#000" flood-opacity="${mode === "dark" ? 0.5 : texture === "tactile" ? 0.12 : 0.08}"/></filter>`);
    const fill = texture === "glass" ? `${surface}" fill-opacity="${mode === "dark" ? 0.72 : 0.8}` : surface;
    back.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${radius}" fill="${fill}" filter="url(#lift)"${texture === "glass" ? ` stroke="${mode === "dark" ? "#ffffff" : "#ffffff"}" stroke-opacity="${mode === "dark" ? 0.12 : 0.7}" stroke-width="1.5"` : ""}/>`);
  }
  if (texture === "minimal" || texture === "technical") {
    back.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${border}" stroke-width="2"/>`);
  }
  if (texture === "technical") {
    for (let x = pad; x < W; x += 80) back.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${border}" stroke-opacity="0.35"/>`);
  }

  // Header: brand mark and product name.
  const markSize = Math.round(H * 0.05);
  const headY = py + pad;
  const product = esc(t.product);
  const markRadius = t.radius >= 12 ? markSize / 2 : Math.min(t.radius / 2, markSize / 4);
  const head = [
    `<rect x="${cx}" y="${headY}" width="${markSize}" height="${markSize}" rx="${markRadius}" fill="${primary}"/>`,
    `<text x="${cx + markSize + 16}" y="${headY + markSize * 0.72}" font-family="${family(fonts.sans)}" font-size="${Math.round(markSize * 0.62)}" font-weight="${medium}" fill="${fg}">${product}</text>`,
  ];

  // Bottom block: metric (with its label above it) and footer.
  const gap = Math.round(H * 0.035);
  const bottom: string[] = [];
  const baseY = py + ph - pad;
  const smallSize = Math.round(H * 0.03);
  let reserved = 0;
  if (input.metric) {
    const metricSize = Math.round(H * 0.1);
    bottom.push(`<text x="${cx}" y="${baseY}" font-family="${family(isMono ? fonts.mono : display)}" font-size="${metricSize}" font-weight="${titleWeight}" fill="${primary}" style="font-variant-numeric: tabular-nums" letter-spacing="-0.02em">${esc(input.metric)}</text>`);
    reserved = metricSize * 0.78;
    if (input.metricLabel) {
      reserved += gap * 0.5;
      bottom.push(`<text x="${cx}" y="${Math.round(baseY - reserved)}" font-family="${labelFamily}" font-size="${smallSize}" fill="${muted}"${isMono ? ' letter-spacing="0.06em"' : ""}>${esc(isMono ? input.metricLabel.toUpperCase() : input.metricLabel)}</text>`);
      reserved += smallSize;
    }
    reserved += gap * 1.4;
  }
  if (input.footer) {
    bottom.push(`<text x="${px + pw - pad}" y="${baseY}" text-anchor="end" font-family="${labelFamily}" font-size="${smallSize}" fill="${muted}">${esc(input.footer)}</text>`);
    if (!input.metric) reserved = smallSize + gap * 1.4;
  }

  // Middle: label, title and body, as one block resting on the bottom block.
  // The title takes the largest size at which everything fits in three lines or fewer.
  const contentTop = headY + markSize + gap * 1.5;
  const contentBottom = baseY - reserved;
  const available = contentBottom - contentTop;
  const labelSize = smallSize;
  const labelBlock = input.label ? labelSize * 1.9 : 0;
  const bodySize = Math.round(H * 0.036);
  const bodyLead = bodySize * 1.45;
  const titleWidth = contentW * (W > H ? 0.86 : 1);
  const leadOf = (size: number) => size * (fonts.display ? 1.05 : 1.1);
  const sizes = [0.13, 0.115, 0.1, 0.088, 0.076, 0.066, 0.058, 0.05].map((k) => Math.round(H * k));
  const fitTitle = (bodyBlock: number) => {
    for (const size of sizes) {
      const lines = wrap(input.title, titleWidth, size, titleFactor, 3);
      if (lines && labelBlock + lines.length * leadOf(size) + bodyBlock <= available) return { size, lines };
    }
    return fitText(input.title, titleWidth, [sizes.at(-1)!], titleFactor, 3);
  };
  let body = input.body ? fitText(input.body, contentW * 0.82, [bodySize], 0.5, 2) : null;
  let bodyBlock = body ? bodySize * 0.8 + body.lines.length * bodyLead : 0;
  let fitted = fitTitle(bodyBlock);
  // A small card can't hold everything: the title matters more than the sentence under it.
  if (body && fitted.size < sizes[3]!) {
    const without = fitTitle(0);
    if (without.size > fitted.size) {
      body = null;
      bodyBlock = 0;
      fitted = without;
    }
  }
  const titleLead = leadOf(fitted.size);
  const mid: string[] = [];
  let y = Math.max(contentTop, contentBottom - (labelBlock + fitted.lines.length * titleLead + bodyBlock));
  if (input.label) {
    mid.push(`<text x="${cx}" y="${Math.round(y + labelSize)}" font-family="${labelFamily}" font-size="${labelSize}" fill="${muted}"${isMono ? ' letter-spacing="0.08em"' : ""}>${esc(isMono ? input.label.toUpperCase() : input.label)}</text>`);
    y += labelBlock;
  }
  for (const line of fitted.lines) {
    mid.push(`<text x="${cx}" y="${Math.round(y + titleLead * 0.8)}" font-family="${family(display)}" font-size="${fitted.size}" font-weight="${titleWeight}" fill="${fg}" letter-spacing="${fonts.display ? "-0.01em" : "-0.025em"}">${esc(line)}</text>`);
    y += titleLead;
  }
  if (body) {
    y += bodySize * 0.8;
    for (const line of body.lines) {
      mid.push(`<text x="${cx}" y="${Math.round(y + bodyLead * 0.75)}" font-family="${family(fonts.sans)}" font-size="${bodySize}" fill="${muted}">${esc(line)}</text>`);
      y += bodyLead;
    }
  }

  const title = esc([input.label, input.title, input.metric && `${input.metric}${input.metricLabel ? ` ${input.metricLabel}` : ""}`].filter(Boolean).join(". "));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
<title>${title}</title>
${defs.length ? `<defs>${defs.join("")}</defs>\n` : ""}${back.join("\n")}
${head.join("\n")}
${mid.join("\n")}
${bottom.join("\n")}
</svg>
`;
}
