# SPEC: The atom

GOAL:    a developer who opens the README understands, without reading, that a few choices in auto-design
         become a whole design system: its components, its site and its own animations.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps. Muted loop in the README, MP4 with no sound.
TIME:    34 s x 30 = 1020 frames. No music (README autoplays muted).

## LOOK

The onboarding's own dark gallery, measured from `packages/cli/src/onboard/onboard.html`.

- Ground: `#08080a` (`--mat`) with one soft lift, a radial `rgb(255 255 255 / .05)` at 50% 0%, 60% wide.
  No grain, no vignette.
- Ink: `#f2f2f3`; muted `#8e8e96`; faint `#5c5c63`.
- Cards: graphite `#161618` to `#111113`, 26 px radius, 7 px inset, 1 px gradient edge
  `rgb(255 255 255 / .1)` top to `.025` bottom. Shadow `0 1px 2px rgb(0 0 0 / .5), 0 18px 44px -26px rgb(0 0 0 / .9)`.
- The one highlight: the selection ring, 1.25 px conic from `rgb(255 255 255 / .82)` through `.14` and `.42`,
  turning once every 8 s. Only on the option just chosen.
- The one solid action: the metal pill, `linear-gradient(180deg, #fff, #e8e8eb 50%, #c8c8ce)`, ink `#0b0b0c`.
- Color: none in the chrome. The only color is the system on the hero card; pastels are saved for the
  payoff (dreamy), and the vibe roll shows each vibe's own color for 0.5 s.
- Type: Inter Variable. Step questions 44 px / 500 / -0.02em, ink with the onboarding's title gradient
  (`#ffffff` to `#b9b9c0`). Option names 22 px / 500. Claim 96 px / 500 / -0.035em. Command 34 px mono.
- Hero card: the product's real renderer (`core/src/site/renderer.js` + `renderer.css`) drawing the real
  specimen of each state, zoomed 2.45x from a 350 x 276 tile: 858 x 676 px, 63% of the frame height.

## OBJECTS

- The hero card: a real preview tile (the `object`, `moment` scenes) for Moonbeam, "a pastel diary for
  collectors of tiny things". Its text is the system's own copy, never invented.
- Option cards: rebuilt from the onboarding's `.proof` and `.pal` styles, each drawing its real option
  with the same renderer and specimen the onboarding shows.
- The cursor: a white macOS-style arrow, 54 px (5% of the frame height), 1 px `#0b0b0c` stroke, soft
  shadow. It enters from off-frame and every click causes a change on the same frame.
- Surfaces: the renderer's real `app`, `hero`, `chat`, `code`, `mcp`, `sms` scenes in the final system.
- The design site: a real 2x screenshot of the published Moonbeam site, captured each run.
- The brand animation: the real `launch` film that `auto-design animate` renders for Moonbeam.
- The mark: auto-design's own favicon, a #17181a square with a white dot, at 104 px with 26 px corners.

## MOTION

- Arrivals `expo.out` 0.5 s; camera and container moves `power2.inOut` 0.55 s; exits `power3.in`, 60% of
  their entrance. Card content swaps: blur swap, out 0.16 s (8 px blur), in 0.16 s.
- Recolor: an iris (`clip-path: circle()`) of the new state opens from the cursor's click point across the
  card in 0.42 s `power2.inOut`.
- Type: the headline re-sets in the chosen pairing with a blur swap (Fraunces to Instrument Serif). The
  storyline's corners beat became type: the dreamy vibe already has the roundest corners the Shape step
  offers (16px).
- The press: the real system's motion tokens (`d.motion.fast`, `enterScale`, `easeOut`), slowed 1.6x so
  it reads on video.
- Cursor: travels 0.45-0.7 s `power2.inOut` with up to 10 px blur at its fastest frame; press 0.08 s down
  to 0.9 scale, 0.14 s back.
- Staggers: option cards 50 ms; surface tiles 70 ms.
- Motion blur on the root (`data-motion-blur="on"`) for the whips and the zoom.

## SHOTS

| Frames | Time | Hero move | The viewer reads | Hands off by |
| --- | --- | --- | --- | --- |
| 0-84 | 0.0-2.8 | Gray decision card (Quiet, "Approve the Q4 plan?") center; the Kind row slides up; the cursor clicks Consumer app and the card blur-swaps into Moonbeam's dreamy invitation | "What kind of product is it?" (0.2-2.8) | the row morphing into the vibe row |
| 84-180 | 2.8-6.0 | Four clicks across the vibe row: Luxury, Sci-fi, Playful, Dreamy; the card follows each | "Pick a vibe" (2.9-6.0) | whip of the row out left |
| 180-270 | 6.0-9.0 | Palette row whips in; click on one palette; iris recolors the card from the click | "Choose a brand color" | the row dropping away |
| 264-330 | 8.8-11.0 | Four pairings blur in; click Instrument; the headline re-sets in it | "Choose type" | the cards blurring out |
| 330-408 | 11.0-13.6 | The card moves to the middle; the cursor presses its main button; it answers with the system's own press | "Choose motion" | the cursor leaving, a 0.5 s hold |
| 408-522 | 13.6-17.4 | The card shrinks to 0.6 and the system's six surfaces fly out of it, 70 ms apart; rows land, bars grow, messages arrive | the surfaces | the card growing past the frame |
| 522-651 | 17.4-21.7 | The card becomes the world; the real design site fades in at 1.5x, pans to the components, then to its player | the site's own headline | the player starting to play |
| 651-855 | 21.7-28.5 | The camera goes through the site's player; the brand animation fills the frame | its own words | the ground flooding back to near black |
| 855-930 | 28.5-31.0 | The claim on the ground, in two beats | "One card. A whole system." | the words blurring out |
| 930-1020 | 31.0-34.0 | The empty mark lands, a click drops its dot, the wordmark wipes in, the command lands and holds 2 s | "auto-design", "npx auto-design init" | end |

## BANNED

- The defaults in the HyperFrames spec guide: glow, particles, a void with small floating things,
  purple gradients, three cards in a row, a title over a dimmed screenshot, the docked logo, every
  element fading and sliding up.
- Anything the product doesn't do: no hover previews, no drag on the card, no invented controls.
- Lorem ipsum or invented copy on the hero card: it shows the system's own copy.
- Bounce on UI; titles that move after they land.

## QA

- 0.0: the gray card, readable, not black (the thumbnail).
- 1.6: the card is Moonbeam's invitation; the Consumer card has the ring.
- 4.8: a vibe other than dreamy on the card.
- 7.4: mid-iris, two colors split by a circle.
- 10.2: the headline in Instrument Serif.
- 16.5: six surfaces around the card, none clipped.
- 19.5: the real site, sharp.
- 26.0: the brand animation, not black.
- 29.5: the claim, alone.
- 33.0: mark, wordmark and command.
