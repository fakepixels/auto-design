# auto-design product film: three storylines

The one thing: pick a few things you like, and auto-design builds a whole design system around them,
down to its components, its site and its animations.

Every film is cut from real footage of the onboarding, captured fresh on each run with the mock model,
so the film never shows a screen the product no longer has. The product in each is invented
(working name: Moonbeam, "a pastel diary for collectors of tiny things").

Assumptions for all three: 30 to 40 seconds, 1920×1080 at 30 fps, no voiceover. Silent, because the
README plays it muted on a loop; a music bed needs a HeyGen sign-in (catalog music) and can be added
later.

## A. The atom (recommended: it is Tina's own pitch, "the system as the atom, scale to any molecules")

Device: the feature as the hook. Form: one frame that rebuilds.

One decision card sits in the middle of the frame for the whole film. Every choice in onboarding
re-skins it in place, and at the end it splits into the whole system.

- First two seconds: a plain gray decision card fills the center of a graphite frame; a big cursor
  clicks "Consumer app" and the card turns into Moonbeam's pastel invitation card on the same frame.
- Beats: card changes kind (bag, agent chat, invitation) → vibe → a palette click recolors it → corners
  soften → a press shows its motion → the card splits into buttons, fields and pages, the design site
  assembles around it, and its brand animation fills the frame → "One card. A whole system." → end card:
  the mark lands, `npx auto-design init`.
- Look: the onboarding's own chrome. Near-black graphite, metal pill buttons, the white-to-gray turning
  ring as the one highlight, Inter. Moonbeam's pastels are the only color, saved for the payoff.
- Sound: silent (README loop); with music, a calm pulse that opens at the split.

## B. Your site in, a system out

Device: one object across apps. Form: one continuous take.

A real web page becomes a design system without a cut: the camera travels from the page into the drop
stage, into the gallery, into the finished design site.

- First two seconds: Moonbeam's web page fills the frame (a local page made for the film); a scan line
  runs down it and its colors, typeface and corner radius lift off as chips.
- Beats: the scan lifts colors, type and corners → they land in the drop stage → made-for-you options
  deal out and the bolder one is picked → kind and vibe → publish → the design site opens in Moonbeam's
  brand → "Bring your taste. Get a system." → end card.
- Look: three worlds. The brand's white page, the dark gallery, then the generated site; the chips are
  the carrier the eye follows from one to the next.
- Sound: silent; with music, the bed enters when the chips lift off the page.

## C. Agents can't go off-brand (the bold one)

Device: life before and after. Form: split screen to one.

The developer's story, not the onboarding's: a coding agent drifts off-brand, the build fails, and the
system pulls everything back.

- First two seconds: a coding agent's diff writes `bg-[#ff5fa2] rounded-[13px]` and, beside it, a pricing
  page grows a hot pink button with the wrong corners next to two correct ones.
- Beats: the agent writes UI → drift piles up (five pinks, four radii) → `auto-design check` fails the
  build with its real message → the agent reads `DESIGN.md` through the MCP server → every element snaps
  onto the system in one frame → "Your agents can't go off-brand." → end card.
- Look: the agent's terminal in mono on graphite, the page in the generated system; the red failure is
  the only saturated color until the snap.
- Sound: silent; with music, near silence under the drift, the bed lands on the snap.
