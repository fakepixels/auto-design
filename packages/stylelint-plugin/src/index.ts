import { dirname, resolve } from "node:path";
import stylelint from "stylelint";
import { checkSource, findGuardrails, loadGuardrails, prepare, type GuardrailsLike } from "@auto-design/check";

/**
 * `auto-design/guardrails` for Stylelint: the same CSS checks as
 * `npx auto-design check` (raw colors, literal sizes and durations, @apply
 * classes, token overrides), reported inline in the editor.
 */

export const ruleName = "auto-design/guardrails";
const messages = stylelint.utils.ruleMessages(ruleName, {
  violation: (message: string) => message,
});

const cache = new Map<string, GuardrailsLike | null>();
function guardrailsFor(file: string, override?: string): GuardrailsLike | null {
  const key = override ?? dirname(file);
  if (!cache.has(key)) {
    const path = override ? resolve(override) : findGuardrails(dirname(file));
    cache.set(key, path ? prepare(loadGuardrails(path)) : null);
  }
  return cache.get(key) ?? null;
}

const rule = ((enabled: boolean, options?: { guardrails?: string; includeWarnings?: boolean }) => {
  return (root: import("postcss").Root, result: stylelint.PostcssResult) => {
    if (!enabled) return;
    const file = root.source?.input.file ?? resolve("inline.css");
    if (/auto-design\.css$/.test(file)) return;
    const g = guardrailsFor(file, options?.guardrails);
    if (!g) return;
    const { violations } = checkSource(root.source?.input.css ?? root.toString(), file.endsWith(".css") ? file : `${file}.css`, g);
    for (const v of violations) {
      if (v.severity === "warn" && !options?.includeWarnings) continue;
      stylelint.utils.report({
        ruleName,
        result,
        node: root,
        message: messages.violation(`${v.message} (${v.rule})`),
        start: { line: v.line, column: v.column },
        end: { line: v.line, column: v.column + 1 },
        severity: v.severity === "warn" ? "warning" : undefined,
      });
    }
  };
}) as unknown as stylelint.Rule;

rule.ruleName = ruleName;
rule.messages = messages;

export default stylelint.createPlugin(ruleName, rule);
