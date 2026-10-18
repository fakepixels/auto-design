import { dirname, resolve } from "node:path";
import { checkSource, findGuardrails, loadGuardrails, prepare, type GuardrailsLike, type Violation } from "@auto-design/check";

/**
 * Two rules over the same checker, split by the severity the design system
 * assigns: `auto-design/errors` and `auto-design/warnings`. Exceptions marked
 * with `// auto-design-allow <rule>: <reason>` are honored, exactly as in
 * `npx auto-design check`.
 */

type Context = {
  filename?: string;
  getFilename?: () => string;
  sourceCode?: { text: string };
  getSourceCode?: () => { text: string };
  cwd?: string;
  options: unknown[];
  report: (d: { loc: { line: number; column: number }; message: string }) => void;
};

const cache = new Map<string, GuardrailsLike | null>();

function guardrailsFor(file: string, override?: string): GuardrailsLike | null {
  const key = override ?? dirname(file);
  if (!cache.has(key)) {
    const path = override ? resolve(override) : findGuardrails(dirname(file));
    cache.set(key, path ? prepare(loadGuardrails(path)) : null);
  }
  return cache.get(key) ?? null;
}

function makeRule(severity: Violation["severity"]) {
  return {
    meta: {
      type: "problem" as const,
      docs: {
        description:
          severity === "error"
            ? "Off-system UI that the design system forbids: raw colors, palette classes, off-scale values, motion rules."
            : "Design system advisories: voice, gradient text, emoji.",
      },
      schema: [
        {
          type: "object",
          properties: { guardrails: { type: "string", description: "Path to auto-design.json, if not found by walking up." } },
          additionalProperties: false,
        },
      ],
    },
    create(context: Context) {
      const filename = context.filename ?? context.getFilename?.() ?? "file.tsx";
      const source = context.sourceCode?.text ?? context.getSourceCode?.().text ?? "";
      const options = (context.options[0] ?? {}) as { guardrails?: string };
      return {
        "Program:exit"() {
          const g = guardrailsFor(filename, options.guardrails);
          if (!g) return;
          const { violations } = checkSource(source, filename, g);
          for (const v of violations) {
            if (v.severity !== severity) continue;
            context.report({ loc: { line: v.line, column: Math.max(0, v.column - 1) }, message: `${v.message} (${v.rule})` });
          }
        },
      };
    },
  };
}

const plugin = {
  meta: { name: "@auto-design/eslint-plugin", version: "0.1.0" },
  rules: {
    errors: makeRule("error"),
    warnings: makeRule("warn"),
  },
  configs: {} as Record<string, unknown>,
};

plugin.configs.recommended = {
  name: "auto-design/recommended",
  plugins: { "auto-design": plugin },
  rules: {
    "auto-design/errors": "error",
    "auto-design/warnings": "warn",
  },
};

export default plugin;
