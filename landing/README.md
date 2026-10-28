# Landing page

auto-design's own landing page, built with auto-design's own design system.

- `../brand/` is the system. It was made in onboarding like any other (`npm run brand` replays those choices
  through onboarding's API and rewrites the folder).
- This folder installed it with `npx auto-design add brand --cwd landing --components button,code-block`,
  so the page can only use the system's classes and must pass its checker.
- `src/page.tsx` is the whole page. `build.mts` prerenders it to static HTML, compiles its CSS with Tailwind
  against the system's locked theme, self-hosts the fonts and copies the product film from `docs/media/`.

```sh
npm run landing                          # writes landing/dist/, ready to host anywhere static
npx auto-design check --cwd landing      # must stay at 0 errors and 0 warnings
LANDING_URL=https://… npm run landing    # absolute og:image for link previews once it has a home
```

When `brand/` changes, run the `add` command above again so `src/auto-design.css` and `DESIGN.md` follow it.
`public/og.png` is drawn by the system too: `npx auto-design card --cwd landing --size og --mode dark`.
