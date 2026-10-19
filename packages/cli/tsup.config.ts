import { defineConfig } from "tsup";

/**
 * The published `auto-design` package is self-contained: the workspace
 * packages (@auto-design/core, check, presets, ai) are bundled in, so one
 * npm package carries the CLI, the onboarding app, the studio and the
 * library types that design.config.ts imports.
 */
export default defineConfig({
  entry: { bin: "src/bin.ts", index: "src/index.ts" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  splitting: true,
  noExternal: [/^@auto-design\//],
  external: ["playwright", "playwright-core"],
  dts: {
    entry: { index: "src/index.ts" },
    resolve: true,
    compilerOptions: { baseUrl: ".", paths: { "@auto-design/core": ["../core/src/index.ts"], "@auto-design/check": ["../check/src/index.ts"], "@auto-design/presets": ["../presets/src/index.ts"], "@auto-design/ai": ["../ai/src/index.ts"] } },
  },
});
