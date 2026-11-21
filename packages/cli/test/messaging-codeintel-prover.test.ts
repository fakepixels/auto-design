import { expect, it } from 'vitest';
import { runMessage } from "../src/agents.js";

it("rejects a bare public shortener in an SMS", async () => {
  const report = await runMessage({
    text: "Meridian: Your invoice is ready. See it at bit.ly/abc123",
    cwd: process.cwd(),
    channel: "sms",
    kind: "transactional",
    first: false,
    json: true,
  });
  expect(report.ok).toBe(false);
});
