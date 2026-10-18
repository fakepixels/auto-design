import type { DesignConfig } from "@auto-design/core";
import editorial from "./editorial.js";
import glass from "./glass.js";
import quiet from "./quiet.js";
import tactile from "./tactile.js";
import terminal from "./terminal.js";

/** The starter systems, in the order onboarding shows them. */
export const presets: Record<string, DesignConfig> = {
  quiet,
  editorial,
  glass,
  terminal,
  tactile,
};

export type PresetName = keyof typeof presets;
export { editorial, glass, quiet, tactile, terminal };
