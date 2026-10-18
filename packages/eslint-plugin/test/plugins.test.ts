import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Linter } from "eslint";
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import { buildGuardrails, buildSystem } from "../../core/src/index.js";
import { presets } from "../../presets/src/index.js";
import plugin from "../src/index.js";
import stylelintPlugin from "../../stylelint-plugin/src/index.js";

const dir = mkdtempSync(join(tmpdir(), "ad-lint-"));
const guardrails = join(dir, "auto-design.json");
writeFileSync(guardrails, JSON.stringify(buildGuardrails(buildSystem(presets.quiet!))));

describe("eslint plugin", () => {
  const linter = new Linter({ configType: "flat", cwd: dir });
  const config = [
    {
      files: ["**/*.jsx"],
      plugins: { "auto-design": plugin as never },
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      rules: {
        "auto-design/errors": ["error", { guardrails }],
        "auto-design/warnings": ["warn", { guardrails }],
      },
    },
  ] as Linter.Config[];

  it("reports violations with their positions and severities", () => {
    const code = `export const A = () => <Button className="bg-blue-500 p-4">Create New Project</Button>;\n`;
    const messages = linter.verify(code, config, { filename: join(dir, "a.jsx") });
    expect(messages.map((m) => [m.ruleId, m.severity, m.line, m.column])).toEqual([
      ["auto-design/errors", 2, 1, 43],
      ["auto-design/warnings", 1, 1, 60],
    ]);
    expect(messages[0]!.message).toContain("no-palette-color");
  });

  it("honors explicit exceptions", () => {
    const code = `// auto-design-allow no-palette-color: partner brand badge\nexport const A = () => <span className="bg-blue-500" />;\n`;
    expect(linter.verify(code, config, { filename: join(dir, "b.jsx") })).toEqual([]);
  });
});

describe("stylelint plugin", () => {
  it("reports CSS violations", async () => {
    const result = await stylelint.lint({
      code: ".a { color: #333; font-size: 15px; }\n.b { color: var(--foreground); }\n",
      codeFilename: join(dir, "x.css"),
      config: { plugins: [stylelintPlugin], rules: { "auto-design/guardrails": [true, { guardrails }] } },
    });
    const warnings = result.results[0]!.warnings;
    expect(warnings.map((w) => [w.line, w.text.match(/\(([\w-]+)\) \(auto-design\/guardrails\)$/)?.[1]])).toEqual([
      [1, "no-raw-color"],
      [1, "type-scale"],
    ]);
    expect(result.errored).toBe(true);
  });
});
