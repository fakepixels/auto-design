/**
 * Library entry for `import type { DesignConfig } from "auto-design"` in
 * design.config.ts, and for tools that want to build or check programmatically.
 */
export { buildSystem, defineConfig, emitAll, type DesignConfig, type DesignSystem } from "@auto-design/core";
export { check, checkSource, type CheckResult, type Guardrails } from "@auto-design/check";
export { presets } from "@auto-design/presets";
