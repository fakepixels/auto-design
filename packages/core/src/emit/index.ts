import type { DesignSystem } from "../system.js";
import { emitCss } from "./css.js";
import { emitDesignMd } from "./design-md.js";
import { emitGuardrails } from "./guardrails.js";
import { emitRegistry } from "./registry.js";
import { emitTokens } from "./tokens.js";

export { componentSources, type ComponentSource } from "./components.js";
export { emitCss, LOCKED_NAMESPACES, themeTokens, rootTokens } from "./css.js";
export { emitDesignMd } from "./design-md.js";
export { RULES, buildGuardrails, emitGuardrails, type Guardrails, type RuleId, type Severity } from "./guardrails.js";
export { emitRegistry } from "./registry.js";
export { emitBaseTokens, emitModeTokens, emitTokens } from "./tokens.js";

/** Every generated file in a design system repo, keyed by path. */
export function emitAll(s: DesignSystem): Record<string, string> {
  return {
    "css/auto-design.css": emitCss(s),
    "DESIGN.md": emitDesignMd(s),
    ...emitTokens(s),
    ...emitGuardrails(s),
    ...emitRegistry(s),
    "build-report.json": JSON.stringify(s.report, null, 2) + "\n",
  };
}
