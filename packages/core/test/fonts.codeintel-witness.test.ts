import * as assert from "node:assert/strict";
import { describe, it } from 'vitest';
import { presets } from "../../presets/src/index.js";
import { customFonts, pairingOf } from "../src/fonts";
import type { DesignConfig } from "../src/schema.js";

const base = presets.quiet!;
const withType = (type: Partial<DesignConfig["type"]>): DesignConfig => ({ ...base, type: { ...base.type, ...type } as DesignConfig["type"] });

describe("font pairing detection", () => {
  it("rejects a curated pairing when its monospace face differs", () => {
    const config = withType(customFonts({ sans: "instrument-sans", mono: "geist-mono", display: "instrument-serif" }));
    const detected = pairingOf(config);

    assert.strictEqual(detected, null, "A mono mismatch must not be identified as the Instrument curated pairing");
  });
});
