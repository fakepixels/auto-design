import { parse } from "@babel/parser";
import { analyzeClass, analyzeClassList, containsRawColor, splitClasses } from "./classes.js";
import type { Finding, GuardrailsLike } from "./types.js";

export interface Located extends Finding {
  line: number;
  column: number;
}

export interface CommentInfo {
  text: string;
  line: number;
  endLine: number;
}

const CLASS_FNS = new Set(["cn", "clsx", "cx", "cva", "twMerge", "twJoin", "tv", "classNames", "classnames"]);
const CLASS_NAME = /^(?:className|classNames|class|\w+ClassName)$/;
const COLOR_ATTRS = new Set(["fill", "stroke", "color", "stopColor", "floodColor", "lightingColor", "stop-color", "flood-color"]);
const SAFE_COLOR_VALUES = new Set(["currentColor", "currentcolor", "none", "transparent", "inherit", "context-fill", "context-stroke"]);
const NAMED_COLORS = /^(?:red|blue|green|white|black|gray|grey|yellow|orange|purple|pink|brown|navy|teal|cyan|magenta|silver|gold|maroon|lime|olive|aqua|fuchsia)$/i;
const STYLE_COLOR_KEY = /(?:color|background|fill|stroke|shadow|border|outline)/i;
const MOTION_ATTRS = new Set(["initial", "animate", "exit", "whileHover", "whileTap", "whileFocus", "whileInView", "whileDrag", "transition", "variants"]);
const LABEL_ELEMENTS = new Set([
  "Button", "button", "DropdownMenuItem", "MenuItem", "TabsTrigger", "SelectItem",
  "CommandItem", "ContextMenuItem", "MenubarItem", "Tab", "MenuButton",
]);
const MINOR_WORDS = new Set(["a", "an", "the", "and", "or", "but", "to", "of", "in", "on", "for", "at", "by", "with", "as", "vs"]);
const EMOJI = /\p{Extended_Pictographic}/u;

interface Ctx {
  cls: boolean;
  style: boolean;
  motion: boolean;
  element?: string;
  /** Inside a link or id attribute, where "#abc" is a fragment, not a color. */
  fragment?: boolean;
}

const FRAGMENT_KEYS = /^(?:href|to|id|hash|htmlFor|xlinkHref|anchor|target|aria-[a-z]+)$/;

type Node = { type: string; start?: number | null; end?: number | null; [k: string]: unknown };

function lineIndex(source: string) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1);
  return (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - starts[lo]! + 1 };
  };
}

/** Title Case check: every significant word after the first is capitalized. */
export function isTitleCase(text: string): boolean {
  const words = text.trim().split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  if (words.length < 2) return false;
  const rest = words.slice(1).filter((w) => !MINOR_WORDS.has(w.toLowerCase()));
  if (!rest.length) return false;
  return rest.every((w) => /^[A-Z][a-z]/.test(w));
}

export function scanJs(source: string, filename: string, g: GuardrailsLike): { findings: Located[]; comments: CommentInfo[] } {
  const isTs = /\.(?:ts|tsx|mts|cts)$/.test(filename);
  const isJsx = /\.(?:tsx|jsx|js|mjs)$/.test(filename);
  const plugins: ("typescript" | "jsx")[] = [];
  if (isTs) plugins.push("typescript");
  if (isJsx) plugins.push("jsx");

  let ast;
  try {
    ast = parse(source, { sourceType: "module", plugins, errorRecovery: true });
  } catch {
    return { findings: [], comments: [] };
  }

  const at = lineIndex(source);
  const findings: Located[] = [];
  const add = (f: Finding | Finding[], offset: number) => {
    const pos = at(offset);
    for (const x of Array.isArray(f) ? f : [f]) findings.push({ ...x, ...pos });
  };

  const checkClassString = (value: string, offset: number, element?: string) => {
    let i = 0;
    const classes = splitClasses(value);
    for (const cls of classes) {
      const idx = value.indexOf(cls, i);
      i = idx + cls.length;
      const f = analyzeClass(cls, g);
      if (f.length) add(f, offset + idx);
    }
    const combined = analyzeClassList(classes, element);
    if (combined.length) add(combined, offset);
  };

  const checkPlainString = (value: string, offset: number, ctx: Ctx) => {
    const v = value.trim();
    if (ctx.fragment && v.startsWith("#")) return;
    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) || /^(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/i.test(v)) {
      add({ rule: "no-raw-color", message: `Raw color "${v}". Use a role variable such as var(--primary) or var(--chart-1).` }, offset);
    }
  };

  const isRawColorValue = (v: string) =>
    !SAFE_COLOR_VALUES.has(v.trim()) && !/^var\(/.test(v.trim()) && !/^url\(/.test(v.trim()) && (containsRawColor(v) || NAMED_COLORS.test(v.trim()));

  const keyName = (k: unknown): string | null => {
    const n = k as Node;
    if (n?.type === "Identifier") return n.name as string;
    if (n?.type === "StringLiteral") return n.value as string;
    return null;
  };

  const jsxName = (n: unknown): string | null => {
    const node = n as Node;
    if (node?.type === "JSXIdentifier") return node.name as string;
    if (node?.type === "JSXMemberExpression") return jsxName(node.property);
    return null;
  };

  const walk = (node: Node | null | undefined, ctx: Ctx): void => {
    if (!node || typeof node !== "object" || typeof node.type !== "string") return;

    switch (node.type) {
      case "StringLiteral": {
        const value = node.value as string;
        const offset = (node.start ?? 0) + 1;
        if (ctx.cls) checkClassString(value, offset, ctx.element);
        else checkPlainString(value, offset, ctx);
        return;
      }
      case "TemplateLiteral": {
        for (const q of node.quasis as Node[]) {
          const value = ((q.value as { cooked?: string; raw: string }).cooked ?? (q.value as { raw: string }).raw) as string;
          if (ctx.cls) checkClassString(value, q.start ?? 0, ctx.element);
          else checkPlainString(value, q.start ?? 0, ctx);
        }
        for (const e of node.expressions as Node[]) walk(e, ctx);
        return;
      }
      case "JSXText": {
        const text = node.value as string;
        if (!text.trim()) return;
        if (EMOJI.test(text)) add({ rule: "no-emoji", message: "Emoji in UI text. Use an icon component, or plain words." }, node.start ?? 0);
        if (g.voice.uiCase === "sentence" && ctx.element && LABEL_ELEMENTS.has(ctx.element) && isTitleCase(text)) {
          add({ rule: "ui-case", message: `"${text.trim()}" is Title Case. Labels use sentence case ("${text.trim()[0]}${text.trim().slice(1).toLowerCase()}"). Proper nouns are fine; allow them with a comment.` }, node.start ?? 0);
        }
        return;
      }
      case "JSXElement": {
        const opening = node.openingElement as Node;
        const name = jsxName(opening.name) ?? undefined;
        walk(opening, { ...ctx, element: name });
        for (const child of node.children as Node[]) walk(child, { ...ctx, element: name });
        return;
      }
      case "JSXAttribute": {
        const name = jsxName(node.name) ?? (node.name as Node & { name?: { name?: string } })?.name?.name ?? "";
        const value = node.value as Node | null;
        if (!value) return;
        if (CLASS_NAME.test(name)) return walk(value, { ...ctx, cls: true });
        if (name === "style") return walk(value, { ...ctx, style: true });
        if (MOTION_ATTRS.has(name)) return walk(value, { ...ctx, motion: true });
        if (COLOR_ATTRS.has(name) && value.type === "StringLiteral" && isRawColorValue(value.value as string)) {
          add({ rule: "no-raw-color", message: `${name}="${value.value}" is a raw color. Use currentColor and a text-* role, or var(--chart-1).` }, value.start ?? 0);
          return;
        }
        return walk(value, { ...ctx, fragment: FRAGMENT_KEYS.test(name) });
      }
      case "CallExpression": {
        const callee = node.callee as Node;
        const fn = callee.type === "Identifier" ? (callee.name as string) : null;
        walk(callee, ctx);
        const argCtx = fn && CLASS_FNS.has(fn) ? { ...ctx, cls: true } : ctx;
        for (const a of node.arguments as Node[]) walk(a, argCtx);
        return;
      }
      case "ObjectProperty": {
        const key = keyName(node.key);
        const value = node.value as Node;
        if (key && CLASS_NAME.test(key)) return walk(value, { ...ctx, cls: true });
        if (ctx.style && key && STYLE_COLOR_KEY.test(key) && value.type === "StringLiteral" && isRawColorValue(value.value as string)) {
          add({ rule: "no-raw-color", message: `style ${key}: "${value.value}" is a raw color. Use var(--role) or a Tailwind role class.` }, value.start ?? 0);
          return;
        }
        if (ctx.motion || key === "transition") {
          if (key === "scale" && value.type === "NumericLiteral" && value.value === 0) {
            add({ rule: "no-scale-zero", message: `scale: 0. Start from ${g.motion.enterScale} with a fade instead; nothing appears from nothing.` }, value.start ?? 0);
          }
          if (key === "duration" && value.type === "NumericLiteral") {
            const v = value.value as number;
            const ms = v <= 10 ? v * 1000 : v;
            if (ms > g.motion.maxDuration) {
              add({ rule: "motion-duration", message: `duration ${v}${v <= 10 ? "s" : "ms"} is longer than the ${g.motion.maxDuration}ms ceiling for UI motion.` }, value.start ?? 0);
            }
          }
          return walk(value, { ...ctx, motion: true });
        }
        if (key === "style") return walk(value, { ...ctx, style: true });
        return walk(value, { ...ctx, fragment: !!key && FRAGMENT_KEYS.test(key) });
      }
      case "ImportDeclaration":
      case "ExportAllDeclaration":
      case "TSImportType":
        return;
    }

    for (const k of Object.keys(node)) {
      if (k === "loc" || k === "start" || k === "end" || k === "extra" || k.endsWith("Comments")) continue;
      const v = node[k];
      if (Array.isArray(v)) for (const item of v) walk(item as Node, ctx);
      else if (v && typeof v === "object" && typeof (v as Node).type === "string") walk(v as Node, ctx);
    }
  };

  walk(ast.program as unknown as Node, { cls: false, style: false, motion: false });

  const comments: CommentInfo[] = (ast.comments ?? []).map((c) => ({
    text: c.value,
    line: c.loc?.start.line ?? 0,
    endLine: c.loc?.end.line ?? 0,
  }));
  return { findings, comments };
}
