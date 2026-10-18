import type { DesignSystem } from "../system.js";
import type { SpecimenCopy } from "../site/copy.js";
import { emitCodeThemes } from "./code.js";
import { emitCss } from "./css.js";
import { emitDesignMd } from "./design-md.js";
import { emitGuardrails } from "./guardrails.js";
import { emitRegistry } from "./registry.js";
import { emitTokens } from "./tokens.js";
import { emitSite } from "./site.js";
import { componentSources } from "./components.js";

export { componentSources, skinFor, type ComponentSource, type Skin } from "./components.js";
export { emitSite } from "./site.js";
export { emitCss, isDarkFirst, LOCKED_NAMESPACES, themeTokens, rootTokens } from "./css.js";
export { emitDesignMd } from "./design-md.js";
export { codeContrast, codeTheme, emitCodeThemes, syntaxColors, type CodeTheme, type SyntaxRole } from "./code.js";
export { RULES, buildGuardrails, emitGuardrails, type Guardrails, type RuleId, type Severity } from "./guardrails.js";
export { emitRegistry } from "./registry.js";
export { emitBaseTokens, emitModeTokens, emitTokens } from "./tokens.js";

/** A short index for agents that fetch the hosted site, per the llms.txt convention. */
export function emitLlmsTxt(s: DesignSystem): string {
  const lines = [
    `# ${s.config.displayName} design system`,
    "",
    `> ${s.config.description || "Tokens, components and guardrails for every surface the product touches."}`,
    "",
    "Read DESIGN.md before writing any UI for this product. Install the system with `npx auto-design add <this site>/r/`",
    "and check work with `npx auto-design check`.",
    "",
    "## Docs",
    "",
    "- [DESIGN.md](DESIGN.md): every rule, role, scale and component, written for coding agents",
    "- [Registry](r/registry.json): shadcn registry items, installable one at a time",
    "",
    "## Components",
    "",
    ...componentSources(s).map((c) => `- [${c.title}](r/${c.name}.json): ${c.description}`),
    "",
  ];
  return lines.join("\n");
}

export interface EmitOptions {
  /** Sample content for the docs site, kept in specimen.copy.json so rebuilds reproduce it. */
  copy?: SpecimenCopy;
}

/** Every generated file in a design system repo, keyed by path. */
export function emitAll(s: DesignSystem, opts: EmitOptions = {}): Record<string, string> {
  const designMd = emitDesignMd(s);
  return {
    "css/auto-design.css": emitCss(s),
    "DESIGN.md": designMd,
    "public/DESIGN.md": designMd,
    "public/llms.txt": emitLlmsTxt(s),
    ...emitSite(s, opts.copy),
    ...emitTokens(s),
    ...emitGuardrails(s),
    ...emitRegistry(s),
    ...emitCodeThemes(s),
    "build-report.json": JSON.stringify(s.report, null, 2) + "\n",
  };
}
