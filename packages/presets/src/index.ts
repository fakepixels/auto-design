import type { DesignConfig } from "@auto-design/core";
import quiet from "./quiet.js";

export const presets: Record<string, DesignConfig> = {
  quiet,
};

export type PresetName = keyof typeof presets;
export { quiet };
