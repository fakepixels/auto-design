# auto-design: notes for Claude

auto-design turns a handful of taste choices (brand color, type, texture, density, motion, surfaces) into a
design system repo with hard guardrails: a locked Tailwind v4 theme, shadcn components, W3C tokens, a
DESIGN.md that coding agents read, a checker that fails the build, and agent tools (MCP server, message and
card tools, a rendered-page review). MIT. Owner: Tina He (GitHub `fakepixels`). Read README.md for the
user-facing story; this file is how to work on it.

## Starting a session

- A new session has no memory of earlier ones. This file, README.md and `git log` are the record, so keep
  Status below current at the end of every piece of work, including decisions and Tina's feedback.
- In a fresh cloud workspace: clone `fakepixels/auto-design`, run `npm install`, then `npm test` and
  `npm run typecheck` to confirm a clean start. Chromium is at `/opt/pw-browsers`; ffmpeg is usually on PATH.
- The sandbox's `gh` is signed in as fakepixels, so anything that creates repos or publishes is real. Never
  let an automated run create a GitHub repo, and don't spend real model API keys without asking.
- Commits are authored as Tina He <fkpxls@gmail.com>. Run `git fetch origin main` before pushing to main.

## Status

- Phases 0 to 3 are done: compiler, checker, studio, five presets, onboarding app, publishing and hosting,
  docs site, MCP server, chat components, MCP Apps adapter, iMessage and SMS rules, image cards, `review`.
- Last session (October 18 to 21, 2026) shipped, in order: the design site and custom components
  (9a9da8e), then brand animations and 161 typefaces (a1d2e7e). Tina's words on the goal: "the AGI of
  design where with this design system as the atom, you can scale to any molecules, including animations."
  Open question for her: commit a1d2e7e also carried motion-token edits (reveal, stagger, travel distance,
  ambient in `scales.ts` and the CSS emitter) that were already in the tree, of unknown origin.
- Phase 4 (in progress): quality and launch prep. Done: the `auto-design` npm package builds as one
  bundle (`packages/cli`, `npm publish` from there); the studio previews the system's own copy and says
  when its process stopped; custom components, examples and docs survive rebuilds. The taste pass and the
  dark-gallery onboarding Tina picked are on main (6d9d7bd, ad91440; see Design direction). Still to do:
  give the Surfaces and Review steps the same one-object previews, refresh the README screenshots in docs/,
  and visual regression screenshots.
- Phase 5 (first version done): the white-label design site, `packages/site`. Home, docs for every
  foundation, a page per component with live examples, search, light and dark, phone layouts; team pages
  from `docs/`. Onboarding ends on it (`/site/` in the onboarding server), the studio serves it at
  `/site/`, `auto-design serve` previews it. Next: blocks.
  - Decision: the plan said "a generated Next.js shell". It shipped as a static site built by auto-design
    instead (React prerender plus hydrated islands, bundled with esbuild): no Next.js install or build in
    every system repo, it's ready in about two seconds at the end of onboarding, and every host that
    serves `public/` today keeps working. The ownership split is the same: auto-design owns the shell, the
    repo owns `components/`, `examples/` and `docs/`.
- Phase 8 (first version done, pulled ahead because Tina called it the core value: the system is the atom,
  animations are molecules): `core/src/motion/`. A motion language derived from the profile
  (`language.ts`), 10 scene templates plus a composed `launch` film (`templates.ts`), shared CSS
  (`css.ts`), the runtime in `core/src/site/motion-runtime.js` (pauses every CSS animation and drives one
  clock, so playback, scrubbing and video frames match), standalone documents (`document.ts`) and the
  `motion` lib for apps (`lib.ts`). `auto-design animate` renders with Playwright frame stepping into
  ffmpeg (`cli/src/animate.ts`); the site's Motion section plays and edits them (`site/src/motion.ts`,
  `motion-player.js`); MCP has `list_animations` and `render_animation`.
- Fonts: 161 OFL families in `core/src/font-catalog.ts` (generated from Fontsource metadata on npm), 53
  pairings in seven moods in `fonts.ts`, and hand-picked faces (`customFonts`, the `fonts` patch field).
  Onboarding's type step filters by mood and has a "Your own" picker.
- Plan after that:
  - Phase 6: blocks, an Agent Skill per system, named registry installs (`@northwind/button`).
  - Phase 7: brand static media (logo, illustration and icons, social and OG images, ads, email, slides),
    code-first with image models opt-in, plus media checks and a Brand section on the site.
  - Phase 8 next: more scenes, sound, longer films. Remotion stays out (paid for companies over 3 people).
  - Phase 9: no-code editing, a preset gallery, maybe a hosted version. Local and self-hosted first.
  - Dogfood: build the onboarding and site chrome from an auto-design system.
- Known gaps:
  - `auto-design` is not on npm yet (still free on October 19, 2026). Until it is, the `.mcp.json` that
    `add` writes (`npx auto-design mcp`) only works where the package is linked locally.
  - The design site loads the system's fonts from Google Fonts; self-hosting them (for intranets with no
    outside access) needs the fontsource packages at build time.
  - Model features (onboarding suggestions, review critique) are tested only against the mock provider.

## Design direction

- Tina's bar for auto-design's own UI: simple, subtle and elevated, in the spirit of Apple, Linear and
  shadcn. No heavy drop shadows or decorative chrome.
- The original onboarding (step list on the left, live specimen on the right) is the keeper. A full
  redesign ("stage and swatchbook", commit 6b39da1) was tried and reverted: it read as busier, not more
  elegant. Future polish refines the original in small steps.
- Functionality comes before UI polish: finish the planned features first.
- Taste pass (October 21, 2026), after Tina called the textures, motion and default presets ugly and pointed
  at bencho.dev, affectui.com, runeicons.com and minimal.gallery. What those share, and what auto-design now
  does: monochrome first with color as a rare accent; surfaces separated by light steps and hairline rings
  (`0 0 0 1px`), not gray borders and dark drop shadows; soft layered shadows (a tight contact layer plus a
  wide ambient one); a 1px light inner edge on raised buttons (`shadow-raised`); medium-weight headings with
  tight tracking; short ease-out motion that answers a press. Glass is a frosted pane over a faint aurora
  in the brand's neighboring hues, never three colored blobs. Technical heroes sit on a dot grid (`bg-grid`).
  Quiet is an ink brand; an ink or paper brand flips to the other end of the grays in the other mode.
  Review preset changes with `scripts/preset-sheet.mts` (every preset on the onboarding specimens, light and
  dark, and trial variants through `VARIANTS`).
- Onboarding gallery (October 21, 2026). Tina saw three mockups of the Start step and picked the dark
  gallery: near-black page, graphite cards (22px radius, 6px inset) holding a framed preview (17px), name and
  one short line under it, Back and Continue in a top bar, steps without numbers, and an As designed / Light /
  Dark switch over every gallery. Light mode is its paper twin. Every option preview is one composed object
  (the `object` scene: a decision card in the system's type, color, surface and corners) instead of a crowded
  dashboard, so the only differences on screen are the ones being chosen; type uses the `typeface` scene.
  The Surfaces and Review steps still use the older full scenes.

## Layout

| Path | What it is |
| --- | --- |
| `packages/core` | Config schema, OKLCH color engine, scales, font catalog, contrast enforcement, every emitter (`src/emit/`), the specimen renderer shared by onboarding, studio and docs site (`src/site/`), brand animations (`src/motion/`), agent surfaces (`src/agents/`: messaging rules, image cards, MCP Apps layer, chat components, agent theme) |
| `packages/check` | The guardrail checker (Babel for TSX, PostCSS for CSS) |
| `packages/presets` | Quiet, Editorial, Glass, Terminal, Tactile |
| `packages/ai` | Model calls over fetch (Anthropic, OpenAI, OpenRouter, mock): config patches, copy, site extraction, review critique |
| `packages/site` | The design site: `bundle.ts` (examples prerendered in Node, interactive ones hydrated as islands), `css.ts` (Tailwind compiled against the system's own CSS, so only on-system classes exist), `pages.ts` (content), `shell.ts` (layout), `site-client.js` (search, tabs, copy, mode) |
| `packages/cli` | `init` (onboarding app in `src/onboard/`), `dev` (studio in `src/dev/`), `add`, `build`, `serve`, `check`, `mcp` (`src/mcp/`), `message`, `card`, `animate`, `review` (`src/review/`); `custom.ts` reads a repo's `components/`, `examples/` and `docs/` |
| `packages/eslint-plugin`, `packages/stylelint-plugin` | The checker inside editors |
| `examples/quiet-design` | A generated system repo (Quiet preset) |
| `examples/next-quiet` | A Next.js app with that system installed. Not a workspace: it has its own `npm install` |

## Invariants

- In a system repo, `design.config.ts` and the `components/`, `examples/` and `docs/` folders are
  hand-edited; the build reads them and never writes them. Everything else is generated, and CI fails if
  generated files drift (the site's JS and CSS in `public/_site/` are exempt: they depend on dependency
  versions).
- Generated component examples (`core/src/emit/examples.ts`) pass the checker for every preset; a custom
  example that fails to render shows an error box on its page and a build warning, never a failed build.
- Models never write CSS or code. They return a config patch; the compiler validates it, with one retry.
- Tailwind's default namespaces are locked (`--color-*: initial` and friends), so off-system classes don't
  exist. Every text and fill pair passes WCAG AA in light and dark mode at build time.
- Every generated component passes the checker and compiles with Tailwind for every preset on every surface
  (`packages/core/test/presets.test.ts`). Add new components there, not around it.

## Commands

```sh
npm install
npm test                 # vitest, about 180 tests
npm run typecheck
npx auto-design <command>   # runs the TypeScript sources through tsx
```

When emitters change, regenerate the examples and recheck the app:

```sh
npx auto-design build --cwd examples/quiet-design      # also builds the site into public/
cd examples/next-quiet && npx auto-design add ../quiet-design --components <changed> --no-install && npx auto-design check
```

## Scripts

```sh
node scripts/shot.cjs <url> <out.png> [width] [height] [full] [light|dark]   # screenshot, fonts served locally
npx tsx scripts/motion-sheet.mts [preset] [ids|all] [format] [mode]          # contact sheet of every animation
npx tsx scripts/preset-sheet.mts [presets|all] [light|dark|both] [tag]        # every preset on the onboarding specimens
python3 scripts/fonts/curate.py | node scripts/fonts/fetch.mjs                  # look up new families on npm
python3 scripts/fonts/gen.py                                                    # rewrite core/src/font-catalog.ts
```

To add a typeface, add a line to `scripts/fonts/curate.py` (style, roles, a one-line note), fetch, then gen.
Only families in the root devDependencies render in screenshots; others fall back and the scripts say so.

## Working conventions

- Run tests and typecheck, regenerate examples, then commit and push to `main` at the end of each phase.
- Look at UI changes, don't assume: screenshot onboarding, the studio and the design site with Playwright
  in light and dark mode and at phone width. Google Fonts isn't reachable from the sandbox; route its CSS
  to the @fontsource packages in node_modules when a screenshot needs the real typefaces.
- Automated runs of onboarding must never create a real GitHub repo: untick the GitHub option before
  publishing. `AUTO_DESIGN_MOCK_MODEL=1` adds a mock model; `AUTO_DESIGN_FORCE_UI=1` opens onboarding
  without a TTY; `AUTO_DESIGN_CHROMIUM` points cards and reviews at a Chromium binary.
- Browser-side code embedded in template strings (`site/renderer.js` consumers, `review/audit.ts`,
  `emit/site.ts`) needs doubled backslashes in regexes.
- The studio started from onboarding runs inside the `init` process; ending it stops the studio.
- Animation scenes: every animated element sets its own `--d` delay (the `d()` helper); scenes in a
  sequence fade on `--sd`, which elements never read. Sizes are in stage units (`--u`, 1% of the short
  side), never px. Review a change with a contact sheet (`scripts/motion-sheet.mts`).
- Every font catalog entry must be OFL-1.1 and carry a style, roles and a one-line note (see Scripts).
- Product copy follows the system's own voice: plain words, sentence case, active verbs, no emoji, errors
  that say what to do next.
