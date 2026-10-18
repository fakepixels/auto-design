import type { DesignConfig } from "@auto-design/core";
import { configSource } from "../commands.js";

/** The fields the studio edits. Everything else in design.config.ts is left alone. */
export interface StudioEdits {
  brand?: string;
  neutral?: "cool" | "neutral" | "warm";
  radius?: number;
}

export function applyEdits(config: DesignConfig, edits: StudioEdits): DesignConfig {
  return {
    ...config,
    color: {
      ...config.color,
      ...(edits.brand !== undefined ? { brand: edits.brand } : {}),
      ...(edits.neutral !== undefined ? { neutral: edits.neutral } : {}),
    },
    shape: { ...config.shape, ...(edits.radius !== undefined ? { radius: edits.radius } : {}) },
  };
}

const quote = (s: string) => JSON.stringify(s);

/**
 * Rewrite only the edited values in the config source, so comments and
 * formatting someone added by hand survive. Falls back to regenerating the
 * file when a field isn't written in the expected shape.
 */
export function editConfigSource(source: string, config: DesignConfig, edits: StudioEdits): string {
  let out = source;
  let ok = true;
  const swap = (re: RegExp, value: string) => {
    if (re.test(out)) out = out.replace(re, (_m, key: string) => `${key}${value}`);
    else ok = false;
  };
  if (edits.brand !== undefined) swap(/(\bbrand:\s*)(["'`])(?:(?!\2).)*\2/, quote(edits.brand));
  if (edits.neutral !== undefined) swap(/(\bneutral:\s*)(["'])(?:cool|neutral|warm)\2/, quote(edits.neutral));
  if (edits.radius !== undefined) swap(/(\bradius:\s*)\d+(?:\.\d+)?/, String(edits.radius));
  return ok ? out : configSource(applyEdits(config, edits));
}
