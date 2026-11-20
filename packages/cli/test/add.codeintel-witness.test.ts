import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from 'vitest';
import { runAdd } from "../src/add";

const dirs: string[] = [];
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "ad-add-codeintel-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("add components", () => {
  it("preserves an installed dependency while adding another component", async () => {
    const root = tmp();
    const source = join(root, "system");
    const registry = join(source, "public", "r");
    const app = join(root, "app");
    const ui = join(app, "components", "ui");
    mkdirSync(registry, { recursive: true });
    mkdirSync(join(app, "app"), { recursive: true });
    mkdirSync(ui, { recursive: true });

    writeFileSync(
      join(registry, "base.json"),
      JSON.stringify({
        name: "base",
        type: "registry:style",
        files: [{ path: "css/auto-design.css", type: "registry:style", content: ":root { --system: true; }\n" }],
      }),
    );
    writeFileSync(
      join(registry, "approval.json"),
      JSON.stringify({
        name: "approval",
        type: "registry:ui",
        meta: { requires: ["button"] },
        files: [{ path: "components/ui/approval.tsx", type: "registry:ui", content: "export const Approval = () => null;\n" }],
      }),
    );
    writeFileSync(
      join(registry, "button.json"),
      JSON.stringify({
        name: "button",
        type: "registry:ui",
        files: [{ path: "components/ui/button.tsx", type: "registry:ui", content: "export const Button = () => <button>registry</button>;\n" }],
      }),
    );
    writeFileSync(join(app, "app", "globals.css"), '@import "tailwindcss";\n');

    const customizedButton = "export const Button = () => <button>developer variant</button>;\n";
    const buttonPath = join(ui, "button.tsx");
    writeFileSync(buttonPath, customizedButton);

    await runAdd({ source, cwd: app, components: ["approval"], install: false, mcp: false });

    assert.strictEqual(readFileSync(buttonPath, "utf8"), customizedButton, "Adding approval must preserve the developer's existing button component");
  });
});
