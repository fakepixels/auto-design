import postcss, { type AtRule, type ChildNode, type Declaration } from "postcss";
import { analyzeClass, analyzeClassList, containsRawColor, splitClasses } from "./classes.js";
import type { CommentInfo, Located } from "./scan-js.js";
import type { GuardrailsLike } from "./types.js";

/** Blocks where literal values are token definitions, not usage. */
const DEFINITION_AT_RULES = new Set(["theme", "property", "font-face", "keyframes", "custom-variant"]);

function inDefinitionBlock(node: ChildNode): boolean {
  let p: { type: string; parent?: unknown } | undefined = node.parent as { type: string; parent?: unknown } | undefined;
  while (p && p.type !== "root" && p.type !== "document") {
    if (p.type === "atrule" && DEFINITION_AT_RULES.has((p as unknown as AtRule).name)) return true;
    p = p.parent as { type: string; parent?: unknown } | undefined;
  }
  return false;
}

const DEFAULT_LOCKED = ["--color-*", "--font-*", "--text-*", "--font-weight-*", "--tracking-*", "--leading-*", "--radius-*", "--shadow-*", "--inset-shadow-*", "--drop-shadow-*", "--text-shadow-*", "--blur-*", "--ease-*", "--animate-*"];
const SYSTEM_RUNTIME_VARS = ["--radius", "--duration-fast", "--duration-base", "--duration-slow", "--enter-scale", "--enter-distance"];

function inThemeBlock(node: ChildNode): boolean {
  let p: { type: string; parent?: unknown } | undefined = node.parent as { type: string; parent?: unknown } | undefined;
  while (p && p.type !== "root" && p.type !== "document") {
    if (p.type === "atrule" && (p as unknown as AtRule).name === "theme") return true;
    p = p.parent as { type: string; parent?: unknown } | undefined;
  }
  return false;
}

function durationsMs(value: string): number[] {
  return [...value.matchAll(/(?<![\w-])(\d*\.?\d+)(ms|s)\b/g)].map((m) => (m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1])));
}

export function scanCss(source: string, _filename: string, g: GuardrailsLike): { findings: Located[]; comments: CommentInfo[] } {
  const findings: Located[] = [];
  const comments: CommentInfo[] = [];
  let root;
  try {
    root = postcss.parse(source);
  } catch {
    return { findings, comments };
  }

  const pos = (n: ChildNode) => ({ line: n.source?.start?.line ?? 0, column: n.source?.start?.column ?? 0 });

  root.walk((node) => {
    if (node.type === "comment") {
      comments.push({ text: node.text, line: node.source?.start?.line ?? 0, endLine: node.source?.end?.line ?? 0 });
      return;
    }
    if (node.type === "atrule" && node.name === "apply") {
      const classes = splitClasses(node.params);
      for (const cls of classes) for (const f of analyzeClass(cls, g)) findings.push({ ...f, ...pos(node) });
      for (const f of analyzeClassList(classes)) findings.push({ ...f, ...pos(node) });
      return;
    }
    if (node.type !== "decl") return;
    const decl = node as Declaration;
    if (decl.prop.startsWith("--")) {
      // Custom properties are definitions. In app CSS, redefining the system's own is drift.
      const prefixes = (g.lockedNamespaces ?? DEFAULT_LOCKED).map((n) => n.replace(/\*$/, ""));
      const ownedTheme = inThemeBlock(decl) && prefixes.some((p) => decl.prop.startsWith(p));
      const ownedRole = !inThemeBlock(decl) && (g.colors.roles.includes(decl.prop.slice(2)) || SYSTEM_RUNTIME_VARS.includes(decl.prop));
      if (ownedTheme || ownedRole) {
        findings.push({
          rule: "no-token-override",
          message: `${decl.prop} is defined by the design system (auto-design.css). Remove it here; change design.config.ts to change it.`,
          ...pos(decl),
        });
      }
      return;
    }
    if (inDefinitionBlock(decl)) return;
    const prop = decl.prop.toLowerCase();
    const value = decl.value;
    const usesVar = /var\(--/.test(value);

    if (containsRawColor(value)) {
      findings.push({ rule: "no-raw-color", message: `${prop}: ${value} uses a raw color. Use var(--role).`, ...pos(decl) });
    }
    if (prop === "font-family" && !usesVar && !/^(?:inherit|initial|unset)$/.test(value)) {
      const first = value.split(",")[0]!.trim().replace(/^["']|["']$/g, "");
      if (!g.fonts.cssFamilies.includes(first)) {
        findings.push({ rule: "font-family", message: `font-family: ${value} is not a system font. Use var(--font-sans) or var(--font-mono).`, ...pos(decl) });
      }
    }
    if (prop === "font-size" && !usesVar && /\d(?:px|rem|em)\b/.test(value)) {
      findings.push({ rule: "type-scale", message: `font-size: ${value} is a literal size. Use var(--text-sm) and friends, or a text-* class.`, ...pos(decl) });
    }
    if (prop === "font-weight" && /^\d+$/.test(value) && !Object.values(g.weights).includes(Number(value))) {
      findings.push({ rule: "font-weight", message: `font-weight: ${value} is not a system weight (${Object.values(g.weights).join(", ")}).`, ...pos(decl) });
    }
    if (prop === "border-radius" && !usesVar && /\d(?:px|rem)\b/.test(value) && value !== "9999px") {
      findings.push({ rule: "radius-scale", message: `border-radius: ${value} is a literal. Use var(--radius) or a rounded-* class.`, ...pos(decl) });
    }
    if (/^(?:transition|transition-duration|animation|animation-duration)$/.test(prop) && !/infinite/.test(value)) {
      for (const ms of durationsMs(value)) {
        if (ms !== 0 && !g.motion.durations.includes(ms)) {
          findings.push({ rule: "motion-duration", message: `${prop}: ${value} uses ${ms}ms. Use var(--duration-fast), var(--duration-base) or var(--duration-slow).`, ...pos(decl) });
        }
      }
    }
    if (prop === "transform" && /scale\(\s*0\s*\)/.test(value)) {
      findings.push({ rule: "no-scale-zero", message: `transform: ${value}. Start from the enter scale with a fade instead.`, ...pos(decl) });
    }
  });
  return { findings, comments };
}
