#!/usr/bin/env node
// In this monorepo, run the TypeScript sources directly through tsx.
// In a published package (no src/), run the bundled build.
import { existsSync } from "node:fs";

const src = new URL("./src/bin.ts", import.meta.url);
if (existsSync(src)) {
  const { register } = await import("tsx/esm/api");
  register();
  await import(src.href);
} else {
  await import(new URL("./dist/bin.js", import.meta.url).href);
}
