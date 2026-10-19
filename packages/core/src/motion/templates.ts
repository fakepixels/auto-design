import type { Surface } from "../schema.js";
import type { SpecimenCopy } from "../site/copy.js";
import type { DesignSystem } from "../system.js";
import { motionLanguage, type MotionLanguage } from "./language.js";

/**
 * Brand animations: molecules built from the system's atoms. Each template
 * takes a few words (defaulting to the product's own copy) and returns a
 * scene: HTML whose elements carry their delay, and the scene's length. The
 * stylesheet (motionCss) supplies the movement; the runtime supplies time.
 */

export type AnimationFormat = "landscape" | "square" | "portrait";
export const FORMATS: Record<AnimationFormat, { width: number; height: number; label: string }> = {
  landscape: { width: 1920, height: 1080, label: "16:9" },
  square: { width: 1080, height: 1080, label: "1:1" },
  portrait: { width: 1080, height: 1920, label: "9:16" },
};

export type AnimationProps = Record<string, string | string[]>;

export interface AnimationField {
  key: string;
  label: string;
  /** A list is edited one item per line. */
  kind: "text" | "list";
}

export interface Scene {
  html: string;
  /** Length in ms, including the hold at the end. */
  duration: number;
}

export interface SceneContext {
  s: DesignSystem;
  lang: MotionLanguage;
  props: AnimationProps;
  copy: SpecimenCopy;
  format: AnimationFormat;
}

export interface AnimationTemplate {
  id: string;
  title: string;
  description: string;
  /** What it's for, used to group the gallery. */
  use: "Brand" | "Launch" | "Product" | "Data" | "Social";
  /** Shown only for systems on one of these surfaces. */
  surfaces?: Surface[];
  fields: AnimationField[];
  defaults(copy: SpecimenCopy, s: DesignSystem): AnimationProps;
  render(ctx: SceneContext): Scene;
  /** Loops forever in place (a loader); videos repeat it a few times. */
  loop?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const str = (v: string | string[] | undefined, fallback = "") => (Array.isArray(v) ? v.join(" ") : (v ?? fallback)).toString();
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : String(v ?? "").split(/\n|\|/)).map((x) => x.trim()).filter(Boolean);
const ms = (n: number) => `${Math.round(n)}ms`;
const d = (n: number, extra = "") => ` style="--d:${ms(n)}${extra ? `;${extra}` : ""}"`;
const initial = (name: string) => (name.trim()[0] ?? "A").toUpperCase();
const domainOf = (product: string) => `${product.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`;

/** Headline words that rise out of their own line, one after another. */
function risingWords(text: string, start: number, step: number): { html: string; end: number } {
  const words = text.split(/\s+/).filter(Boolean);
  const html = words
    .map((w, i) => `<span class="adm-clip"><span class="adm-word adm-rise"${d(start + i * step)}>${esc(w)}</span></span>`)
    .join(" ");
  return { html, end: start + (words.length - 1) * step };
}

/** Body words that arrive like streamed text. */
function streamedWords(text: string, start: number, step: number): { html: string; end: number } {
  const words = text.split(/\s+/).filter(Boolean);
  return {
    html: words.map((w, i) => `<span class="adm-word adm-show"${d(start + i * step)}>${esc(w)} </span>`).join(""),
    end: start + words.length * step,
  };
}

const CURSOR = `<svg class="adm-cursor-svg" viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path d="M4 2.5 19.5 12l-7.1 1.3L9 20z" fill="var(--foreground)" stroke="var(--background)" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

/** A pointer that glides in from an offset (in stage units) to the element it sits in. */
const cursor = (at: number, fx: number, fy: number) =>
  `<span class="adm-cursor adm-glide"${d(at, `--fx:${fx};--fy:${fy};right:-2%;bottom:-45%`)}>${CURSOR}</span>`;

const mark = (name: string, at: number, size = 1) =>
  `<span class="adm-mark adm-pop"${d(at, size === 1 ? "" : `width:calc(var(--u)*${12 * size});height:calc(var(--u)*${12 * size});font-size:calc(var(--u)*${6 * size})`)}>${esc(initial(name))}</span>`;

const portrait = (f: AnimationFormat) => f === "portrait";

/* ---------- Templates ---------- */

const logoReveal: AnimationTemplate = {
  id: "logo-reveal",
  title: "Logo reveal",
  description: "The mark arrives, the name follows it out, then the line. An intro or an outro.",
  use: "Brand",
  fields: [
    { key: "name", label: "Name", kind: "text" },
    { key: "tagline", label: "Line", kind: "text" },
  ],
  defaults: (c) => ({ name: c.product, tagline: c.headline }),
  render({ lang, props, format }) {
    const name = str(props.name);
    const b = lang.beat;
    const stacked = portrait(format);
    const html = `<div class="adm-scene">
  <div style="display:flex;${stacked ? "flex-direction:column;" : ""}align-items:center;gap:calc(var(--u)*${stacked ? 4 : 3.2})">
    ${mark(name, 0, 1.15)}
    <span class="adm-display adm-wipe" style="--d:${ms(b * 0.55)};font-size:calc(var(--u)*${stacked ? 11 : 12})">${esc(name)}</span>
  </div>
  ${str(props.tagline) ? `<p class="adm-in adm-muted"${d(b * 1.35, `margin-top:calc(var(--u)*5);font-size:calc(var(--u)*3.2);max-width:calc(var(--u)*110)`)}>${esc(str(props.tagline))}</p>` : ""}
</div>`;
    return { html, duration: b * 2.35 + lang.hold };
  },
};

const announcement: AnimationTemplate = {
  id: "announcement",
  title: "Announcement",
  description: "A headline that rises word by word, one line of context and the call to action.",
  use: "Launch",
  fields: [
    { key: "title", label: "Headline", kind: "text" },
    { key: "subtitle", label: "Line under it", kind: "text" },
    { key: "cta", label: "Button", kind: "text" },
  ],
  defaults: (c) => ({ title: c.headline, subtitle: c.subhead, cta: c.cta, name: c.product }),
  render({ lang, props, copy, format }) {
    const b = lang.beat;
    const words = risingWords(str(props.title), b * 0.35, lang.stagger * 0.6);
    const after = words.end + b * 0.7;
    const size = portrait(format) ? 10 : 9;
    const html = `<div class="adm-scene adm-left" style="justify-content:space-between">
  <div class="adm-fade" style="--d:0ms;display:flex;align-items:center;gap:calc(var(--u)*1.6);font-size:calc(var(--u)*2.6)">
    <span class="adm-mark" style="width:calc(var(--u)*5);height:calc(var(--u)*5);font-size:calc(var(--u)*2.6)">${esc(initial(str(props.name, copy.product)))}</span>
    <span class="adm-medium">${esc(str(props.name, copy.product))}</span>
  </div>
  <div>
    <h1 class="adm-display" style="font-size:calc(var(--u)*${size});max-width:calc(var(--u)*150)">${words.html}</h1>
    ${str(props.subtitle) ? `<p class="adm-in adm-muted"${d(after, `margin-top:calc(var(--u)*4);font-size:calc(var(--u)*3);max-width:calc(var(--u)*100)`)}>${esc(str(props.subtitle))}</p>` : ""}
  </div>
  ${str(props.cta) ? `<span class="adm-button adm-pop"${d(after + lang.stagger * 2)}>${esc(str(props.cta))}</span>` : "<span></span>"}
</div>`;
    return { html, duration: after + lang.stagger * 2 + b + lang.hold };
  },
};

/** "92%" → { prefix, value, suffix, decimals } for the counter. */
export function parseMetric(v: string): { prefix: string; value: number; suffix: string; decimals: number; grouped: boolean } {
  const m = v.trim().match(/^([^\d\-.]*)(-?[\d,]*\.?\d+)(.*)$/);
  if (!m) return { prefix: "", value: 0, suffix: v, decimals: 0, grouped: false };
  const raw = m[2]!;
  const decimals = raw.includes(".") ? raw.split(".")[1]!.length : 0;
  return { prefix: m[1]!, value: Number(raw.replace(/,/g, "")), suffix: m[3]!, decimals, grouped: raw.includes(",") };
}

const counter = (value: string, at: number, length: number) => {
  const m = parseMetric(value);
  return `<span class="adm-num" data-count="${m.value}" data-decimals="${m.decimals}" data-grouped="${m.grouped ? 1 : 0}" data-prefix="${esc(m.prefix)}" data-suffix="${esc(m.suffix)}" data-start="${Math.round(at)}" data-length="${Math.round(length)}">${esc(value)}</span>`;
};

const metric: AnimationTemplate = {
  id: "metric",
  title: "Metric",
  description: "One number that counts up, what it measures, and a line that draws the trend.",
  use: "Data",
  fields: [
    { key: "value", label: "Number", kind: "text" },
    { key: "label", label: "What it is", kind: "text" },
    { key: "note", label: "Context", kind: "text" },
  ],
  defaults: (c) => ({ value: c.metrics[1]?.value ?? "92%", label: c.metrics[1]?.label ?? "On track", note: c.pageSummary }),
  render({ lang, props }) {
    const b = lang.beat;
    const count = b * 2.2;
    const html = `<div class="adm-scene adm-left" style="justify-content:center">
  <p class="adm-in adm-medium adm-muted"${d(0, "font-size:calc(var(--u)*3)")}>${esc(str(props.label))}</p>
  <p class="adm-display adm-fade"${d(b * 0.3, "font-size:calc(var(--u)*24);letter-spacing:-0.04em;margin-top:calc(var(--u)*1)")}>${counter(str(props.value), b * 0.3, count)}</p>
  <svg viewBox="0 0 400 64" style="width:100%;height:auto;margin-top:calc(var(--u)*3);overflow:visible" aria-hidden="true">
    <path class="adm-draw" pathLength="1"${d(b * 0.5)} d="M2 56 C 48 50, 72 40, 112 42 S 176 26, 216 30 S 280 14, 320 16 S 376 8, 398 4" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round"/>
  </svg>
  ${str(props.note) ? `<p class="adm-in adm-muted"${d(b * 0.5 + count * 0.6, "margin-top:calc(var(--u)*3);font-size:calc(var(--u)*2.8);max-width:calc(var(--u)*120)")}>${esc(str(props.note))}</p>` : ""}
</div>`;
    return { html, duration: b * 0.5 + count + lang.hold };
  },
};

const chart: AnimationTemplate = {
  id: "chart",
  title: "Chart",
  description: "Bars that build one by one, the largest in the brand color, with the total counting up.",
  use: "Data",
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "items", label: "Bars (label: value, one per line)", kind: "list" },
  ],
  defaults: (c) => ({ title: c.card.title, items: c.table.rows.map((r) => `${r.name}: ${r.value}`) }),
  render({ lang, props, format }) {
    const b = lang.beat;
    const items = list(props.items).slice(0, 8).map((line) => {
      const [label, value = "0"] = line.split(/:\s*(?=[^:]*$)/);
      return { label: label!.trim(), value: value.trim(), n: parseMetric(value.trim()).value };
    });
    const max = Math.max(1, ...items.map((i) => i.n));
    const top = items.reduce((a, i, k) => (i.n > items[a]!.n ? k : a), 0);
    const step = lang.stagger * 1.4;
    const total = items.reduce((a, i) => a + i.n, 0);
    const first = items[0] ? parseMetric(items[0].value) : null;
    const totalText = first ? `${first.prefix}${total.toLocaleString("en-US", { maximumFractionDigits: first.decimals })}${first.suffix}` : "";
    const html = `<div class="adm-scene adm-left" style="justify-content:space-between">
  <div style="display:flex;justify-content:space-between;align-items:baseline;width:100%;gap:calc(var(--u)*4)">
    <p class="adm-in adm-display"${d(0, "font-size:calc(var(--u)*5.5)")}>${esc(str(props.title))}</p>
    ${totalText ? `<p class="adm-fade adm-display adm-num"${d(b * 0.4, "font-size:calc(var(--u)*5.5)")}>${counter(totalText, b * 0.4, b * 0.4 + step * items.length)}</p>` : ""}
  </div>
  <div style="display:flex;align-items:flex-end;gap:calc(var(--u)*${portrait(format) ? 2 : 3});width:100%;height:58%">
    ${items
      .map(
        (it, k) => `<div style="flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;gap:calc(var(--u)*1.4);min-width:0">
      <p class="adm-fade adm-num adm-medium"${d(b * 0.5 + k * step + b * 0.5, "font-size:calc(var(--u)*2.2)")}>${esc(it.value)}</p>
      <div class="adm-grow"${d(b * 0.5 + k * step, `height:${Math.max(4, (it.n / max) * 82)}%;border-radius:calc(var(--px)*6) calc(var(--px)*6) 0 0;background:${k === top ? "var(--primary)" : "color-mix(in oklab, var(--foreground) 14%, transparent)"}`)}></div>
      <p class="adm-fade adm-muted"${d(b * 0.5 + k * step, "font-size:calc(var(--u)*1.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>${esc(it.label)}</p>
    </div>`,
      )
      .join("")}
  </div>
</div>`;
    return { html, duration: b * 1.5 + step * items.length + lang.hold };
  },
};

const productDemo: AnimationTemplate = {
  id: "product-demo",
  title: "Product walkthrough",
  description: "The app window opens, the pointer takes the main action, and the product answers.",
  use: "Product",
  surfaces: ["web-app"],
  fields: [
    { key: "title", label: "Page title", kind: "text" },
    { key: "action", label: "Button", kind: "text" },
    { key: "done", label: "Confirmation", kind: "text" },
  ],
  defaults: (c) => ({ title: c.pageTitle, action: c.primaryAction, done: c.done, summary: c.pageSummary }),
  render({ lang, props, copy, format }) {
    const b = lang.beat;
    const rows = copy.table.rows.slice(0, portrait(format) ? 3 : 4);
    const tRows = b * 0.6;
    const tCursor = tRows + rows.length * lang.stagger + b * 0.3;
    const tPress = tCursor + b * 1.4;
    const tToast = tPress + 220;
    const tFlip = tToast + b * 0.5;
    const narrow = format !== "landscape";
    const badge = (ok: boolean) => `<span class="adm-badge ${ok ? "adm-ok" : "adm-warn"}">${ok ? "On track" : "Needs review"}</span>`;
    const tall = portrait(format);
    const html = `<div class="adm-scene" style="padding:calc(var(--u)*${narrow ? 5 : 7})">
  <div style="position:relative;width:100%;height:${tall ? "auto" : "100%"}">
  <div class="adm-card adm-in"${d(0, `width:100%;height:${tall ? "auto" : "100%"};overflow:hidden;display:flex;flex-direction:column;text-align:left`)}>
    <div style="display:flex;gap:calc(var(--u)*1);padding:calc(var(--u)*1.8) calc(var(--u)*2.2);border-bottom:calc(var(--px)*1) solid var(--border)">
      ${[0, 1, 2].map(() => `<i style="width:calc(var(--u)*1.2);height:calc(var(--u)*1.2);border-radius:50%;background:var(--border)"></i>`).join("")}
    </div>
    <div style="display:flex;flex:1;min-height:0">
      ${narrow ? "" : `<div style="width:22%;padding:calc(var(--u)*3) calc(var(--u)*2.4);border-right:calc(var(--px)*1) solid var(--border);display:flex;flex-direction:column;gap:calc(var(--u)*1.6);font-size:calc(var(--u)*2)">
        <p class="adm-strong" style="display:flex;align-items:center;gap:calc(var(--u)*1)"><span class="adm-mark" style="width:calc(var(--u)*3);height:calc(var(--u)*3);font-size:calc(var(--u)*1.6)">${esc(initial(copy.product))}</span>${esc(copy.product)}</p>
        ${copy.nav.slice(0, 4).map((n, i) => `<p class="${i === 1 ? "adm-medium" : "adm-muted"}">${esc(n)}</p>`).join("")}
      </div>`}
      <div style="flex:1;padding:calc(var(--u)*${narrow ? 3.5 : 4});display:flex;flex-direction:column;gap:calc(var(--u)*2.4);min-width:0">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:calc(var(--u)*2)">
          <div>
            <p class="adm-display" style="font-size:calc(var(--u)*${narrow ? 4.2 : 4.6})">${esc(str(props.title))}</p>
            <p class="adm-muted" style="font-size:calc(var(--u)*2);margin-top:calc(var(--u)*0.8)">${esc(str(props.summary, copy.pageSummary))}</p>
          </div>
          <span class="adm-button adm-press"${d(tPress)}>${esc(str(props.action))}${cursor(tCursor, -46, 34)}</span>
        </div>
        <div style="display:flex;flex-direction:column;font-size:calc(var(--u)*2.1)">
          ${rows
            .map(
              (r, i) => `<div class="adm-in"${d(tRows + i * lang.stagger, "display:flex;align-items:center;justify-content:space-between;gap:calc(var(--u)*2);padding:calc(var(--u)*1.8) 0;border-top:calc(var(--px)*1) solid var(--border)")}>
            <span class="adm-medium" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</span>
            ${narrow ? "" : `<span class="adm-muted" style="width:24%">${esc(r.detail)}</span>`}
            <span class="adm-num" style="width:${narrow ? 22 : 16}%;text-align:right">${esc(r.value)}</span>
            <span style="width:${narrow ? 30 : 20}%;display:flex;justify-content:flex-end;position:relative">${i === 0 && r.status !== "ok" ? `<span class="adm-hide"${d(tFlip)}>${badge(false)}</span><span class="adm-pop"${d(tFlip, "position:absolute;right:0")}>${badge(true)}</span>` : badge(r.status === "ok")}</span>
          </div>`,
            )
            .join("")}
        </div>
      </div>
    </div>
  </div>
  <div class="adm-card adm-in"${d(tToast, `position:absolute;right:calc(var(--u)*${tall ? 0 : 3});${tall ? "top:calc(100% + var(--u)*4)" : "bottom:calc(var(--u)*3)"};width:calc(var(--u)*${narrow ? 60 : 50});padding:calc(var(--u)*2.4) calc(var(--u)*2.8);text-align:left;box-shadow:0 calc(var(--px)*12) calc(var(--px)*32) oklch(0 0 0 / 0.18)`)}>
    <p class="adm-medium" style="font-size:calc(var(--u)*2.3)">${esc(str(props.done))}</p>
    <p class="adm-muted" style="font-size:calc(var(--u)*1.9);margin-top:calc(var(--u)*0.6)">${esc(copy.pageSummary)}</p>
  </div>
  </div>
</div>`;
    return { html, duration: tFlip + b + lang.hold };
  },
};

const chatDemo: AnimationTemplate = {
  id: "chat-demo",
  title: "Agent conversation",
  description: "A question, a tool call, a streamed answer, and an approval before the agent acts.",
  use: "Product",
  surfaces: ["chat", "mcp-apps"],
  fields: [
    { key: "question", label: "Question", kind: "text" },
    { key: "answer", label: "Answer", kind: "text" },
    { key: "action", label: "What it asks to do", kind: "text" },
  ],
  defaults: (c) => ({ question: c.chat.question, answer: c.chat.answer, action: "Send this summary to the project owners" }),
  render({ lang, props, copy, format }) {
    const b = lang.beat;
    const tTool = b * 0.9;
    const tDone = tTool + b * 1.3;
    const answer = streamedWords(str(props.answer), tDone + b * 0.3, 55);
    const tAsk = answer.end + b * 0.4;
    const tCursor = tAsk + b * 0.6;
    const tPress = tCursor + b * 1.4;
    const narrow = format !== "landscape";
    const html = `<div class="adm-scene" style="padding:calc(var(--u)*${narrow ? 6 : 8})">
  <div style="width:100%;max-width:calc(var(--u)*140);display:flex;flex-direction:column;gap:calc(var(--u)*3);text-align:left;font-size:calc(var(--u)*${narrow ? 3.2 : 3})">
    <div class="adm-in"${d(0, "align-self:flex-end;max-width:80%;padding:calc(var(--u)*1.6) calc(var(--u)*2.4);border-radius:calc(var(--u)*2.4);background:var(--secondary);color:var(--secondary-foreground)")}>${esc(str(props.question))}</div>
    <div class="adm-in adm-card"${d(tTool, "display:flex;align-items:center;gap:calc(var(--u)*1.4);padding:calc(var(--u)*1.4) calc(var(--u)*2);font-size:0.78em")}>
      <span style="position:relative;width:calc(var(--u)*2);height:calc(var(--u)*2);flex:none">
        <span class="adm-spin adm-hide"${d(tDone, "position:absolute;inset:0;border-radius:50%;border:calc(var(--px)*3) solid color-mix(in oklab, var(--foreground) 15%, transparent);border-top-color:var(--primary)")}></span>
        <span class="adm-pop"${d(tDone, "position:absolute;inset:15%;border-radius:50%;background:var(--success)")}></span>
      </span>
      <span class="adm-mono">${esc(copy.chat.tool)}</span><span class="adm-muted adm-mono" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(copy.chat.toolArgs)}</span>
      <span class="adm-muted" style="position:relative;display:inline-block"><span class="adm-hide"${d(tDone)}>Running</span><span class="adm-show"${d(tDone, "position:absolute;right:0;top:0")}>Done</span></span>
    </div>
    <p style="line-height:1.5">${answer.html}</p>
    <div class="adm-card adm-in"${d(tAsk, "overflow:hidden;font-size:0.86em")}>
      <div style="padding:calc(var(--u)*2) calc(var(--u)*2.4)"><p class="adm-medium">${esc(str(props.action))}</p><p class="adm-muted" style="margin-top:calc(var(--u)*0.5);font-size:0.9em">3 people, by email. They can reply in the thread.</p></div>
      <div style="display:flex;align-items:center;gap:calc(var(--u)*1.6);padding:calc(var(--u)*1.6) calc(var(--u)*2.4);border-top:calc(var(--px)*1) solid var(--border);position:relative">
        <span class="adm-hide"${d(tPress + 200, "display:flex;gap:calc(var(--u)*1.6)")}><span class="adm-button adm-press"${d(tPress, "height:calc(var(--u)*5);font-size:calc(var(--u)*2)")}>Send${cursor(tCursor, -30, 26)}</span><span class="adm-button adm-outline" style="height:calc(var(--u)*5);font-size:calc(var(--u)*2)">Don't send</span></span>
        <span class="adm-show adm-muted"${d(tPress + 200, "position:absolute;left:calc(var(--u)*2.4);display:flex;align-items:center;gap:calc(var(--u)*1)")}><i style="width:calc(var(--u)*1.2);height:calc(var(--u)*1.2);border-radius:50%;background:var(--success)"></i>Sent</span>
      </div>
    </div>
  </div>
</div>`;
    return { html, duration: tPress + b + lang.hold };
  },
};

const textThread: AnimationTemplate = {
  id: "text-thread",
  title: "Text thread",
  description: "A text conversation on a phone: typing, then each message in turn.",
  use: "Social",
  surfaces: ["messaging"],
  fields: [{ key: "messages", label: "Messages (start a reply with >)", kind: "list" }],
  defaults: (c) => ({ messages: c.sms.map((m) => (m.from === "customer" ? `> ${m.text}` : m.text)) }),
  render({ lang, props, format }) {
    const b = lang.beat;
    const msgs = list(props.messages).slice(0, 5);
    let t = b * 0.6;
    const bubbles = msgs
      .map((m) => {
        const mine = m.startsWith(">");
        const text = mine ? m.replace(/^>\s*/, "") : m;
        const typing = mine ? 0 : b * 0.9;
        // Each message keeps its place; the typing dots sit where it will appear, then give way to it.
        const dots = typing
          ? `<span class="adm-show"${d(t, "position:absolute;left:0;bottom:0")}><span class="adm-hide adm-dots"${d(t + typing, "display:block;padding:calc(var(--u)*1.6) calc(var(--u)*2);border-radius:calc(var(--u)*2.6);background:var(--muted)")}><i></i><i></i><i></i></span></span>`
          : "";
        const html = `<div style="position:relative;align-self:${mine ? "flex-end" : "flex-start"};max-width:78%">${dots}<div class="adm-pop"${d(t + typing, `padding:calc(var(--u)*1.6) calc(var(--u)*2.2);border-radius:calc(var(--u)*2.6);text-align:left;transform-origin:${mine ? "right" : "left"} bottom;${mine ? "background:var(--primary);color:var(--primary-foreground)" : "background:var(--muted);color:var(--foreground)"}`)}>${esc(text)}</div></div>`;
        t += typing + b * 1.1;
        return html;
      })
      .join("");
    const html = `<div class="adm-scene" style="padding:calc(var(--u)*5)">
  <div class="adm-in"${d(0, `height:100%;aspect-ratio:${portrait(format) ? "0.5" : "0.49"};max-width:100%;border-radius:calc(var(--u)*7);background:var(--background);box-shadow:0 0 0 calc(var(--u)*1.2) var(--foreground), 0 calc(var(--u)*3) calc(var(--u)*8) oklch(0 0 0 / 0.25);padding:calc(var(--u)*9) calc(var(--u)*3) calc(var(--u)*4);display:flex;flex-direction:column;gap:calc(var(--u)*1.6);justify-content:flex-end;font-size:calc(var(--u)*2.9);overflow:hidden`)}>${bubbles}</div>
</div>`;
    return { html, duration: t + lang.hold };
  },
};

const featureList: AnimationTemplate = {
  id: "feature-list",
  title: "What's new",
  description: "A title, then each feature in turn with a check in the brand color.",
  use: "Launch",
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "items", label: "Features (one per line)", kind: "list" },
  ],
  defaults: (c) => ({ title: `New in ${c.product}`, items: [`${c.primaryAction} in one step`, `${c.card.title}, ready to share`, "Answers from your own data"] }),
  render({ lang, props }) {
    const b = lang.beat;
    const items = list(props.items).slice(0, 5);
    const step = lang.stagger * 3;
    const html = `<div class="adm-scene adm-left">
  <p class="adm-display adm-in"${d(0, "font-size:calc(var(--u)*8.5)")}>${esc(str(props.title))}</p>
  <ul style="list-style:none;padding:0;margin-top:calc(var(--u)*7);display:flex;flex-direction:column;gap:calc(var(--u)*3.6)">
    ${items
      .map(
        (it, i) => `<li class="adm-in"${d(b * 0.8 + i * step, "display:flex;align-items:center;gap:calc(var(--u)*2.6);font-size:calc(var(--u)*4.4)")}>
      <span class="adm-pop"${d(b * 0.8 + i * step + b * 0.25, "display:grid;place-items:center;width:calc(var(--u)*5.6);height:calc(var(--u)*5.6);border-radius:50%;background:var(--primary);color:var(--primary-foreground);flex:none")}><svg viewBox="0 0 24 24" width="55%" height="55%" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span class="adm-medium">${esc(it)}</span>
    </li>`,
      )
      .join("")}
  </ul>
</div>`;
    return { html, duration: b * 1.8 + items.length * step + lang.hold };
  },
};

const endCard: AnimationTemplate = {
  id: "end-card",
  title: "End card",
  description: "Mark, name, the one thing to do next and where to go.",
  use: "Brand",
  fields: [
    { key: "cta", label: "Button", kind: "text" },
    { key: "url", label: "Address", kind: "text" },
  ],
  defaults: (c) => ({ name: c.product, cta: c.cta, url: domainOf(c.product) }),
  render({ lang, props, copy }) {
    const b = lang.beat;
    const name = str(props.name, copy.product);
    const html = `<div class="adm-scene">
  ${mark(name, 0)}
  <p class="adm-display adm-in"${d(b * 0.35, "font-size:calc(var(--u)*7);margin-top:calc(var(--u)*4)")}>${esc(name)}</p>
  ${str(props.cta) ? `<span class="adm-button adm-pop"${d(b * 0.9, "margin-top:calc(var(--u)*5)")}>${esc(str(props.cta))}</span>` : ""}
  ${str(props.url) ? `<p class="adm-fade adm-muted adm-mono"${d(b * 1.3, "margin-top:calc(var(--u)*3);font-size:calc(var(--u)*2.6)")}>${esc(str(props.url))}</p>` : ""}
</div>`;
    return { html, duration: b * 2.3 + lang.hold };
  },
};

const loader: AnimationTemplate = {
  id: "loader",
  title: "Loading",
  description: "The mark over a bar that fills in the system's easing. For splash screens and long waits.",
  use: "Product",
  loop: true,
  fields: [{ key: "label", label: "Label", kind: "text" }],
  defaults: (c) => ({ name: c.product, label: `Loading ${c.product}` }),
  render({ props, copy }) {
    const html = `<div class="adm-scene">
  <span class="adm-mark">${esc(initial(str(props.name, copy.product)))}</span>
  <span style="display:block;width:calc(var(--u)*34);height:calc(var(--u)*1.2);margin-top:calc(var(--u)*5);border-radius:999px;background:color-mix(in oklab, var(--foreground) 10%, transparent);overflow:hidden"><span class="adm-loop" style="display:block;height:100%;background:var(--primary);border-radius:inherit"></span></span>
  ${str(props.label) ? `<p class="adm-muted" style="margin-top:calc(var(--u)*3);font-size:calc(var(--u)*2.4)">${esc(str(props.label))}</p>` : ""}
</div>`;
    return { html, duration: 1600 };
  },
};

export const SCENE_TEMPLATES: AnimationTemplate[] = [logoReveal, announcement, metric, chart, productDemo, chatDemo, textThread, featureList, endCard, loader];

/* ---------- Sequences ---------- */

/** A composed animation: several scenes in a row, crossfading, sharing one clock. */
export interface Sequence {
  id: string;
  title: string;
  description: string;
  use: AnimationTemplate["use"];
  /** Scene ids in order; the first one available for the system's surfaces wins at each slot. */
  slots: string[][];
  fields: AnimationField[];
  /** Which scenes each of the sequence's fields goes to. Scenes keep their own defaults otherwise. */
  bind: Record<string, string[]>;
}

export const SEQUENCES: Sequence[] = [
  {
    id: "launch",
    title: "Launch video",
    description: "Logo, headline, the product in use, what's new and the end card, as one film.",
    use: "Launch",
    slots: [["logo-reveal"], ["announcement"], ["product-demo", "chat-demo", "metric"], ["feature-list"], ["end-card"]],
    fields: [
      { key: "title", label: "Headline", kind: "text" },
      { key: "subtitle", label: "Line under it", kind: "text" },
      { key: "items", label: "Features (one per line)", kind: "list" },
      { key: "cta", label: "Button", kind: "text" },
      { key: "url", label: "Address", kind: "text" },
    ],
    bind: { title: ["announcement"], subtitle: ["announcement"], items: ["feature-list"], cta: ["announcement", "end-card"], url: ["end-card"] },
  },
];

/** The props one scene in a sequence gets: its own defaults, plus the sequence fields bound to it. */
function sceneProps(q: Sequence, scene: AnimationTemplate, copy: SpecimenCopy, s: DesignSystem, props: AnimationProps): AnimationProps {
  const out = scene.defaults(copy, s);
  for (const [key, scenes] of Object.entries(q.bind)) if (scenes.includes(scene.id) && props[key] !== undefined) out[key] = props[key]!;
  return out;
}

/** Everything the gallery lists for one system: its scenes, then its films. */
export interface AnimationInfo {
  id: string;
  title: string;
  description: string;
  use: AnimationTemplate["use"];
  fields: AnimationField[];
  loop: boolean;
  sequence: boolean;
}

const available = (t: AnimationTemplate, s: DesignSystem) => !t.surfaces || t.surfaces.some((x) => s.config.surfaces.includes(x));

export function animationsFor(s: DesignSystem): AnimationInfo[] {
  return [
    ...SCENE_TEMPLATES.filter((t) => available(t, s)).map((t) => ({ id: t.id, title: t.title, description: t.description, use: t.use, fields: t.fields, loop: !!t.loop, sequence: false })),
    ...SEQUENCES.map((q) => ({ id: q.id, title: q.title, description: q.description, use: q.use, fields: q.fields, loop: false, sequence: true })),
  ];
}

export interface RenderedAnimation {
  /** The scene markup for inside a stage frame. */
  html: string;
  duration: number;
  loop: boolean;
}

/** Default props for an animation, from the product's copy. */
export function animationDefaults(id: string, s: DesignSystem, copy: SpecimenCopy): AnimationProps {
  const t = SCENE_TEMPLATES.find((x) => x.id === id);
  if (t) return t.defaults(copy, s);
  const q = SEQUENCES.find((x) => x.id === id);
  if (!q) throw new Error(`Unknown animation "${id}". Available: ${animationsFor(s).map((a) => a.id).join(", ")}`);
  // Each field's default comes from the first scene it's bound to.
  const merged: AnimationProps = {};
  for (const [key, scenes] of Object.entries(q.bind)) {
    for (const id of scenes) {
      const scene = SCENE_TEMPLATES.find((t) => t.id === id);
      const v = scene && available(scene, s) ? scene.defaults(copy, s)[key] : undefined;
      if (v !== undefined) {
        merged[key] = v;
        break;
      }
    }
  }
  return merged;
}

/** Render an animation's scenes for a system: one scene, or a sequence with crossfades. */
export function renderAnimation(s: DesignSystem, id: string, opts: { copy: SpecimenCopy; props?: AnimationProps; format?: AnimationFormat }): RenderedAnimation {
  const lang = motionLanguage(s);
  const format = opts.format ?? "landscape";
  const props = { ...animationDefaults(id, s, opts.copy), ...(opts.props ?? {}) };
  const one = SCENE_TEMPLATES.find((x) => x.id === id);
  if (one) {
    if (!available(one, s)) throw new Error(`${one.title} needs one of these surfaces: ${one.surfaces!.join(", ")}.`);
    const scene = one.render({ s, lang, props, copy: opts.copy, format });
    return { html: scene.html, duration: Math.round(scene.duration), loop: !!one.loop };
  }
  const q = SEQUENCES.find((x) => x.id === id)!;
  const parts: string[] = [];
  let t = 0;
  const scenes = q.slots.map((slot) => slot.map((x) => SCENE_TEMPLATES.find((t) => t.id === x)!).find((x) => available(x, s))).filter((x): x is AnimationTemplate => !!x);
  scenes.forEach((scene, i) => {
    const r = scene.render({ s, lang, props: sceneProps(q, scene, opts.copy, s, props), copy: opts.copy, format });
    const last = i === scenes.length - 1;
    const end = t + r.duration;
    // Each scene fades in at its start and out as the next one fades in; the last one stays.
    parts.push(
      `<div class="adm-seq" style="position:absolute;inset:0;--t0:${Math.round(t)}ms">
  <div class="adm-scene-in" style="position:absolute;inset:0;--sd:0ms"><div class="${last ? "" : "adm-scene-out"}" style="position:absolute;inset:0;--sd:${Math.round(r.duration)}ms">${r.html}</div></div>
</div>`,
    );
    t = last ? end : end - lang.crossfade * 0.5;
  });
  return { html: parts.join("\n"), duration: Math.round(t), loop: false };
}
