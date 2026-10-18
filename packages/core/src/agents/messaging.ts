/**
 * Text messages: iMessage, SMS, RCS, and chat replies. A text thread belongs
 * to the phone, not to the brand, so the system can't style it. What it can
 * do is hold the words to rules: plain text, one point, a recognizable
 * sender, no shouting, and SMS that fits in one segment.
 */

export type MessageChannel = "sms" | "imessage" | "rcs" | "chat";
export type MessageKind = "transactional" | "marketing" | "conversational";

export interface MessageOptions {
  channel: MessageChannel;
  /** Marketing texts need an opt-out line; transactional ones don't. */
  kind?: MessageKind;
  /** The sender name people should recognize, e.g. the product name. */
  product?: string;
  /** The first message in a thread has to say who it's from. */
  first?: boolean;
  /** From the system's voice settings. */
  emoji?: "never" | "sparingly";
}

export type MessageRule =
  | "markdown"
  | "encoding"
  | "length"
  | "sender"
  | "opt-out"
  | "emoji"
  | "shouting"
  | "exclamation"
  | "links"
  | "shortener"
  | "filler"
  | "placeholder";

export interface MessageIssue {
  rule: MessageRule;
  severity: "error" | "warn";
  message: string;
}

export interface MessageReport {
  ok: boolean;
  channel: MessageChannel;
  issues: MessageIssue[];
  /** The message, formatted for the channel: markdown removed for texts, plain punctuation for SMS. */
  text: string;
  original: string;
  /** SMS only: how carriers will encode and split the formatted text. */
  sms?: SmsInfo;
}

export interface SmsInfo {
  encoding: "GSM-7" | "UCS-2";
  /** Characters as carriers count them (GSM-7 extension characters count twice). */
  length: number;
  segments: number;
  /** Characters left before the next segment starts. */
  remaining: number;
}

export const MESSAGE_RULES: Record<MessageRule, string> = {
  markdown: "Texts show markdown as literal symbols. Send plain text.",
  encoding: "Curly quotes, long dashes and emoji switch SMS to UCS-2: 70 characters per segment instead of 160.",
  length: "Say one thing. SMS fits in one segment; iMessage and RCS read in a glance.",
  sender: "The first text in a thread starts with the sender name, like \"Meridian: ...\".",
  "opt-out": "Marketing SMS ends with how to stop, like \"Reply STOP to opt out.\"",
  emoji: "Emoji follow the system's voice setting.",
  shouting: "No words in all caps, except STOP and HELP.",
  exclamation: "At most one exclamation mark.",
  links: "At most one link per text.",
  shortener: "Public link shorteners get texts filtered by carriers. Use your own domain.",
  filler: "Lead with the point, not a greeting or a feeling.",
  placeholder: "No unfilled template variables.",
};

// GSM 03.38 basic set, and the extension table (each costs two characters).
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";
const GSM = new Set([...GSM_BASIC]);
const GSM_EXT = new Set([...GSM_EXTENDED]);

export function smsInfo(text: string): SmsInfo {
  const chars = [...text];
  const gsm = chars.every((c) => GSM.has(c) || GSM_EXT.has(c));
  if (gsm) {
    const length = chars.reduce((n, c) => n + (GSM_EXT.has(c) ? 2 : 1), 0);
    const segments = length <= 160 ? 1 : Math.ceil(length / 153);
    return { encoding: "GSM-7", length, segments, remaining: (segments === 1 ? 160 : segments * 153) - length };
  }
  // UCS-2 counts UTF-16 code units: most emoji take two.
  const length = text.length;
  const segments = length <= 70 ? 1 : Math.ceil(length / 67);
  return { encoding: "UCS-2", length, segments, remaining: (segments === 1 ? 70 : segments * 67) - length };
}

/** Markdown to plain text that reads well in a text thread. */
export function toPlainText(markdown: string): string {
  let t = markdown.replace(/\r\n?/g, "\n");
  t = t.replace(/```[^\n]*\n([\s\S]*?)```/g, (_m, code: string) => code.replace(/\n$/, ""));
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_m, alt: string, url: string) => (alt ? `${alt}: ${url}` : url));
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, label: string, url: string) =>
    label.trim() === url || `https://${label.trim()}` === url ? url : `${label}: ${url}`,
  );
  t = t.replace(/<(https?:\/\/[^>\s]+)>/g, "$1");
  t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*$/gm, "$1");
  t = t.replace(/^[ \t]{0,3}>[ \t]?/gm, "");
  t = t.replace(/^[ \t]{0,3}([-*_])([ \t]*\1){2,}[ \t]*$/gm, "");
  t = t.replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$\n?/gm, "");
  t = t.replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_m, row: string) => row.split("|").map((c) => c.trim()).filter(Boolean).join(", "));
  t = t.replace(/^([ \t]*)[*+][ \t]+/gm, "$1- ");
  t = t.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2");
  t = t.replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, "$1$2");
  t = t.replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1$2");
  t = t.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1");
  t = t.replace(/`([^`\n]+)`/g, "$1");
  t = t.replace(/[ \t]+$/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/** Swap typographic punctuation for plain characters, so SMS stays in GSM-7. */
export function toGsmPunctuation(text: string): string {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/\s?[—]\s?/g, " - ")
    .replace(/[–‒]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")
    .replace(/[     ]/g, " ")
    .replace(/[​‌‍﻿]/g, "");
}

const EMOJI = /\p{Extended_Pictographic}/gu;
const URL_RE = /\bhttps?:\/\/[^\s<>()]+|\b(?:www\.)[^\s<>()]+/gi;
const SHORTENERS = /\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at|tiny\.cc|rb\.gy)\//i;
const OPT_OUT = /\b(?:reply|text|send)\s+["']?stop["']?\b|\bstop\s+to\s+(?:opt[ -]?out|unsubscribe|end|cancel|quit)\b/i;
const FILLER = /^(?:(?:hi|hey|hello|greetings)(?:\s+there)?\b[!,.]?|just (?:wanted|a (?:quick|friendly))\b|we(?:'re| are) (?:excited|thrilled|happy|delighted)\b|as an ai\b|great question\b)/i;
const PLACEHOLDER = /\{\{\s*[\w.]+\s*\}\}|\{[a-z_][\w.]*\}|\[(?:first ?name|name|company|link|url|date)\]|%[sd]\b|<(?:first ?name|name)>/i;
const KEYWORDS = new Set(["STOP", "HELP", "INFO", "START", "UNSTOP", "CANCEL", "END", "QUIT", "UNSUBSCRIBE"]);
const SALES = new Set(["FREE", "NOW", "SALE", "URGENT", "LAST", "HURRY", "WIN", "WINNER", "ACT", "TODAY", "OFF", "NEW"]);

/** Check a message against the system's texting rules and return it formatted for the channel. */
export function checkMessage(original: string, opts: MessageOptions): MessageReport {
  const { channel } = opts;
  const kind = opts.kind ?? "transactional";
  const text = channel === "chat" ? original.trim() : toPlainText(original);
  const issues: MessageIssue[] = [];
  const add = (rule: MessageRule, severity: MessageIssue["severity"], message: string) => issues.push({ rule, severity, message });

  if (channel !== "chat" && text !== original.trim()) {
    add("markdown", "warn", "Markdown doesn't render in text apps. The formatted version removes it.");
  }

  // Emoji first: dropping them can change the SMS encoding and length below.
  let out = text;
  const emoji = original.match(EMOJI) ?? [];
  if (emoji.length) {
    if ((opts.emoji ?? "never") === "never") {
      add("emoji", channel === "chat" ? "warn" : "error", `${emoji.length} emoji. This system's voice uses none${channel === "chat" ? "" : "; the formatted version drops them"}.`);
      if (channel !== "chat") out = out.replace(/\p{Extended_Pictographic}\uFE0F?\u200D?/gu, "").replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?])/g, "$1").trim();
    } else if (emoji.length > 1) add("emoji", "warn", `${emoji.length} emoji. Use one at most.`);
  }

  let sms: SmsInfo | undefined;
  if (channel === "sms") {
    const plain = toGsmPunctuation(out);
    const before = smsInfo(out);
    sms = smsInfo(plain);
    if (before.encoding === "UCS-2" && sms.encoding === "GSM-7" && before.segments > sms.segments) {
      add("encoding", "warn", `Typographic punctuation made this UCS-2 (${before.segments} segment${before.segments > 1 ? "s" : ""}). The formatted version uses plain punctuation: ${sms.segments} segment${sms.segments > 1 ? "s" : ""}.`);
    } else if (sms.encoding === "UCS-2" && sms.segments > 1) {
      add("encoding", "warn", `Characters outside GSM-7 (often emoji) cut each segment to 70 characters. This is ${sms.segments} segment${sms.segments > 1 ? "s" : ""}.`);
    }
    out = plain;
    if (sms.segments > 1) {
      add("length", sms.segments > 3 ? "error" : "warn", `${sms.segments} SMS segments (${sms.length} characters, ${sms.encoding}). Each is billed, and some carriers deliver them out of order. Aim for one: ${sms.encoding === "GSM-7" ? 160 : 70} characters.`);
    }
  } else if (channel === "imessage" || channel === "rcs") {
    if (out.length > 320) add("length", "warn", `${out.length} characters. Texts are read in a glance: say one thing in under 320, and link to the rest.`);
  } else if (out.length > 1600) {
    add("length", "warn", `${out.length} characters. Lead with a two-sentence answer before the detail.`);
  }

  if (opts.product && opts.first && (channel === "sms" || channel === "rcs" || channel === "imessage")) {
    const name = opts.product.trim();
    const starts = out.toLowerCase().startsWith(`${name.toLowerCase()}:`) || out.toLowerCase().startsWith(`${name.toLowerCase()} -`);
    if (!starts) add("sender", channel === "sms" && kind === "marketing" ? "error" : "warn", `Start the first text with "${name}: " so people know who it's from.`);
  }

  if (channel === "sms" && kind === "marketing" && !OPT_OUT.test(out)) {
    add("opt-out", "error", 'Marketing texts end with how to stop, e.g. "Reply STOP to opt out."');
  }

  const product = (opts.product ?? "").toUpperCase();
  const caps = (out.match(/\b[A-Z][A-Z']{2,}\b/g) ?? []).filter((w) => !KEYWORDS.has(w) && w !== product);
  const shouted = caps.filter((w) => w.length >= 5 || SALES.has(w) || (caps.filter((x) => x.length >= 4).length >= 2 && w.length >= 4));
  if (shouted.length) add("shouting", "warn", `All-caps words read as shouting: ${[...new Set(shouted)].slice(0, 3).join(", ")}.`);

  const bangs = (out.match(/!/g) ?? []).length;
  if (bangs > 1) add("exclamation", "warn", `${bangs} exclamation marks. Use one at most, or none.`);

  const urls = out.match(URL_RE) ?? [];
  if (urls.length > 1 && channel !== "chat") add("links", "warn", `${urls.length} links. Send one, and put the rest behind it.`);
  if (urls.some((u) => SHORTENERS.test(u + "/"))) add("shortener", "error", "Public link shorteners get texts filtered by carriers. Link to your own domain.");

  const afterSender = opts.product ? out.replace(new RegExp(`^${opts.product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:-]\\s*`, "i"), "") : out;
  if (FILLER.test(afterSender)) add("filler", "warn", "Lead with the point. Skip the greeting and the excitement.");
  if (PLACEHOLDER.test(original)) add("placeholder", "error", "There's an unfilled template variable.");

  return { ok: !issues.some((i) => i.severity === "error"), channel, issues, text: out, original, sms };
}
