# Review: The atom (first cut, October 28, 2026)

## Calls made

- Storyline A, picked by Tina from three (`STORYLINES.md`). B (your site in, one continuous take) and C (agents
  can't go off-brand, split screen) were not built; either can reuse `scripts/video/capture.mts`.
- The hero card and every option card are drawn live by the product's own renderer (`renderer.js`) from
  specimens the onboarding API returns in that run, not from screenshots. They stay sharp at 2.45x and can't
  drift from the product. The design site and the brand animation are real captures of the published system.
- The corners beat in the storyline became a Type beat: the dreamy vibe already sits at the roundest
  corners the Shape step offers (16px), so there was nothing to soften.
- The end mark is auto-design's own favicon (a #17181a square with a white dot), at 104px.
- Silent: the README plays it muted. HyperFrames' check warns `film_silent`; kept on purpose.

## Measured

- `hyperframes check`: 0 errors. Warnings kept: `css_transition_used` (renderer.css has hover transitions;
  `lib/film.css` turns every transition and animation off inside previews), `line_unread` on the vibe roll
  (four 0.6 s looks at the same three lines, a montage on purpose) and on the gray card's copy in the hook.
- Frames checked at every beat, at the scene hand-offs (17.6 to 18.2, 28.2 to 28.6) and across a full render.

## Fixed along the way

- The color iris left the card empty: GSAP ignores a property that is only in a fromTo's from-vars.
- The site blinked out for 0.1 s at the hand-off: the motion-blur pass composites fast movers on top and drops
  very large ones. The card (`#rb-hero`) and the site (`#pf-world`) opt out with `data-motion-blur="off"`.
- An `<img>` without `data-duration` lasts 3 s in HyperFrames; the site screenshot is a timed clip now.
- Studio stamps `data-hf-id` on every element when the preview server runs. Strip them before committing.

## Weakest shot, and what to try next

- 13.6 to 17.4: the mosaic of six surfaces holds for 2.5 s with only small motions inside it. A camera move
  across it, or one surface acting out a real flow, would carry it better.
- The brand animation shows the system's default copy ("Moonbeam gives your team one place to plan…"),
  which reads as SaaS for a pastel diary. A connected model writes product copy; the film runs without one.
- Not checked: how the WebP preview looks in GitHub's README on a phone.
