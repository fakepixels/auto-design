# auto-design

Design systems with hard guardrails, for teams without a designer and the agents that write their UI.

auto-design turns a handful of taste choices (brand color, type, texture, density, motion) into a design
system repo: a locked Tailwind v4 theme, shadcn components, W3C design tokens, a `DESIGN.md` that coding
agents read, a checker that fails the build when anything drifts off-system, and an MCP server so agents can
ask for the rules and check their work.

![Onboarding: every option is drawn on your own product before you pick it](https://raw.githubusercontent.com/fakepixels/auto-design/main/docs/onboarding.png)

## Make a system

```sh
npx auto-design init                    # design it in the browser
npx auto-design init my-design --preset glass   # or start from a preset
```

Presets: Quiet, Editorial, Glass, Terminal and Tactile, and 161 open-source typefaces in 53 pairings. Onboarding can read your site and screenshots with a
Claude, OpenAI or OpenRouter key, and publishes the system to GitHub with hosting on GitHub Pages, Vercel,
Railway, Render or your intranet.

## The design site

Every system builds a white-label site like ui.shadcn.com into `public/`: a home page, docs for each
foundation, and a page per component with live examples drawn by the real components. Add your own
components, examples and pages in the system repo's `components/`, `examples/` and `docs/` folders.

## Use it in an app

Any Tailwind v4 app (Next.js, Vite, React Router, Astro):

```sh
npx auto-design add ../my-design --components all
npx auto-design check
```

`add` installs the theme, components, `DESIGN.md` and guardrails, points `AGENTS.md` and `CLAUDE.md` at the
rules, and registers the MCP server in `.mcp.json`.

## Commands

| Command | What it does |
| --- | --- |
| `init` | Design a system in the browser, or from a preset |
| `dev` | The studio: adjust color, grays and corners with a live preview, and keep apps in sync |
| `build` | Compile `design.config.ts` into tokens, CSS, components, rules and the design site |
| `serve` | Preview the design site and registry from `public/` |
| `add` | Install a system into an app, from a folder or a hosted `/r/` URL |
| `check` | Lint TSX, JSX and CSS against the guardrails |
| `mcp` | The MCP server for coding agents: rules, tokens, components, code and message checks, image cards |
| `message` | Check an iMessage, SMS or chat message against the voice and texting rules |
| `card` | Draw an image card or link preview in the system's style |
| `animate` | Render a brand animation (logo reveal, announcement, product walkthrough, launch film) to MP4, WebM, GIF or HTML |
| `review` | Screenshot the running app and check what it drew, with an optional design critique |

Full documentation: [github.com/fakepixels/auto-design](https://github.com/fakepixels/auto-design).

## License

MIT
