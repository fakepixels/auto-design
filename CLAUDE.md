# auto-design: notes for Claude

auto-design turns a handful of taste choices (brand color, type, texture, density, motion, surfaces) into a
design system repo with hard guardrails: a locked Tailwind v4 theme, shadcn components, W3C tokens, a
DESIGN.md that coding agents read, a checker that fails the build, and agent tools (MCP server, message and
card tools, a rendered-page review). MIT. Owner: Tina He (GitHub `fakepixels`). Read README.md for the
user-facing story; this file is how to work on it.

## Status

- Phases 0 to 3 are done: compiler, checker, studio, five presets, onboarding app, publishing and hosting,
  docs site, MCP server, chat components, MCP Apps adapter, iMessage and SMS rules, image cards, `review`.
- Phase 4 (in progress): quality and launch prep. The `auto-design` npm package builds as one bundle
  (`packages/cli`, `npm publish` from there). Still to do: studio fixes, custom components that survive
  rebuilds, visual regression screenshots, and raising the five presets and specimen scenes well above
  defaults (Tina has feedback to fold in).
- Plan after that:
  - Phase 5: a white-label design site per system, like ui.shadcn.com (Home, Docs, Components, Blocks,
    live previews), as a generated Next.js shell owned by auto-design with content owned by the system
    repo. Publish deploys it and onboarding ends on it.
  - Phase 6: blocks, an Agent Skill per system, named registry installs (`@northwind/button`).
  - Phase 7: brand static media (logo, illustration and icons, social and OG images, ads, email, slides),
    code-first with image models opt-in, plus media checks and a Brand section on the site.
  - Phase 8: motion and video with an MIT renderer (not Remotion, which is paid for companies over 3
    people).
  - Phase 9: no-code editing, a preset gallery, maybe a hosted version. Local and self-hosted first.
  - Dogfood: build the onboarding and site chrome from an auto-design system.
- Known gaps:
  - `auto-design` is not on npm yet (still free on October 19, 2026). Until it is, the `.mcp.json` that
    `add` writes (`npx auto-design mcp`) only works where the package is linked locally.
  - The studio preview uses a fixed sample product ("Meridian") instead of the system's own copy, and shows
    "Failed to fetch" instead of saying the studio process stopped.
  - Model features (onboarding suggestions, review critique) are tested only against the mock provider.

## Design direction

- Tina's bar for auto-design's own UI: simple, subtle and elevated, in the spirit of Apple, Linear and
  shadcn. No heavy drop shadows or decorative chrome.
- The original onboarding (step list on the left, live specimen on the right) is the keeper. A full
  redesign ("stage and swatchbook", commit 6b39da1) was tried and reverted: it read as busier, not more
  elegant. Future polish refines the original in small steps.
- Functionality comes before UI polish: finish the planned features first.

## Layout

| Path | What it is |
| --- | --- |
| `packages/core` | Config schema, OKLCH color engine, scales, contrast enforcement, every emitter (`src/emit/`), the specimen renderer shared by onboarding, studio and docs site (`src/site/`), agent surfaces (`src/agents/`: messaging rules, image cards, MCP Apps layer, chat components, agent theme) |
| `packages/check` | The guardrail checker (Babel for TSX, PostCSS for CSS) |
| `packages/presets` | Quiet, Editorial, Glass, Terminal, Tactile |
| `packages/ai` | Model calls over fetch (Anthropic, OpenAI, OpenRouter, mock): config patches, copy, site extraction, review critique |
| `packages/cli` | `init` (onboarding app in `src/onboard/`), `dev` (studio in `src/dev/`), `add`, `build`, `check`, `mcp` (`src/mcp/`), `message`, `card`, `review` (`src/review/`) |
| `packages/eslint-plugin`, `packages/stylelint-plugin` | The checker inside editors |
| `examples/quiet-design` | A generated system repo (Quiet preset) |
| `examples/next-quiet` | A Next.js app with that system installed. Not a workspace: it has its own `npm install` |

## Invariants

- `design.config.ts` is the only hand-edited file in a system repo. Everything else is generated, and CI
  fails if generated files drift.
- Models never write CSS or code. They return a config patch; the compiler validates it, with one retry.
- Tailwind's default namespaces are locked (`--color-*: initial` and friends), so off-system classes don't
  exist. Every text and fill pair passes WCAG AA in light and dark mode at build time.
- Every generated component passes the checker and compiles with Tailwind for every preset on every surface
  (`packages/core/test/presets.test.ts`). Add new components there, not around it.

## Commands

```sh
npm install
npm test                 # vitest, about 145 tests
npm run typecheck
npx auto-design <command>   # runs the TypeScript sources through tsx
```

When emitters change, regenerate the examples and recheck the app:

```sh
npx auto-design build --cwd examples/quiet-design
cd examples/next-quiet && npx auto-design add ../quiet-design --components <changed> --no-install && npx auto-design check
```

## Working conventions

- Run tests and typecheck, regenerate examples, then commit and push to `main` at the end of each phase.
- Look at UI changes, don't assume: screenshot onboarding, the studio and the docs site with Playwright
  in light and dark mode and at phone width.
- Automated runs of onboarding must never create a real GitHub repo: untick the GitHub option before
  publishing. `AUTO_DESIGN_MOCK_MODEL=1` adds a mock model; `AUTO_DESIGN_FORCE_UI=1` opens onboarding
  without a TTY; `AUTO_DESIGN_CHROMIUM` points cards and reviews at a Chromium binary.
- Browser-side code embedded in template strings (`site/renderer.js` consumers, `review/audit.ts`,
  `emit/site.ts`) needs doubled backslashes in regexes.
- The studio started from onboarding runs inside the `init` process; ending it stops the studio.
- Product copy follows the system's own voice: plain words, sentence case, active verbs, no emoji, errors
  that say what to do next.
