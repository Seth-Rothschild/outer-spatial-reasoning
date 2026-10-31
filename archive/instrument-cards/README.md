# Instrument cards (moon phase, Boston sky)

Extracted 2026-10-31. See `notes/ui-direction.md` section 3.

## What this was

Two cards below the 3D stage:

- **Moon phase**: an SVG of the Moon's current lit fraction, its phase name
  ("Waxing gibbous" etc.), percent lit, day-of-cycle, and the next full/new moon
  dates.
- **Boston sky**: a horizon-line diagram showing where the Sun and Moon currently
  sit in Boston's sky (altitude/azimuth), plus a day/night/dawn/dusk headline and
  short alt/az text for each body.

## Why it was pulled

Cool, but not presented the right way for this pass -- see `notes/ui-direction.md`.
Pulled out rather than hidden so the naming and complexity-reduction passes don't
have to carry dead-but-present code, and so it doesn't quietly rot out of sync with
the rest of the app.

## What was removed, and from where

- `index.html`: the whole `<section class="cards">` (both `<article>` cards).
- `src/styles.css`: `.cards`, `.card` and its descendants, `#phase-svg`, `#sky-svg`.
- `src/ui.js`: `litDiscPath`, `moonPhaseName`, `SKY_STOPS`, `mixColor` (the ui.js
  copy -- there's a different `mixColor` in `src/textures.js` for color blending in
  procedural textures, which is unrelated and stayed), `skyColorsAt`, `rgbCss`,
  `compassDirection`, `formatShortDate`, `formatClockTime`.
- `src/astronomy.js`: `moonSunElongation`, `nextMoonPhase` (and its
  `PHASE_SEARCH_*` constants), `observerFrame`, `altitudeAzimuth`, `dot3`. These
  had no other callers once the cards were gone -- see "what stayed" below for the
  one thing in this neighborhood that's worth noticing.
- `src/scene.js`: `updateCards()`, the card DOM element refs (`phaseLitPath`,
  `skyMoonLitPath`, `skySunGroup`, `skyMoonGroup`, `skyTopStop`, `skyBottomStop`),
  and its call site in `renderFrame()`'s periodic-update block. Also the portion of
  `computeAstronomy()` that only existed to feed this card: `frameNow`, `frameSoon`,
  `jdSoon`, `sunVec`, `moonTopocentric`, and the `sunAltAz`/`moonAltAz`/
  `sunIsRising`/`elongationDeg`/`illuminatedFraction` fields on `astro`.

## What stayed, and why it matters

`BOSTON_LATITUDE`/`BOSTON_LONGITUDE` and the Boston marker on the globe (the
`boston` mesh, `tagBoston`, its placement in `renderFrame()`) are **not** part of
this archive. The marker's position is a fixed point on Earth's surface set once
in `buildBodies()` -- it never needed `observerFrame()`/`altitudeAzimuth()`, which
were specifically for computing alt/az *from* that point, i.e. "what does the sky
look like if you're standing there." If a future "viewpoint from a body" feature
(see `archive/true-scale/README.md`) wants that again, `observerFrame()` and
`altitudeAzimuth()` here are a reasonable starting point.

## How to bring it back

Not meant to still import or run cleanly. In particular, `computeAstronomy()` in
the live `scene.js` now returns a trimmed-down `astro` shape (see its current
source) -- the alt/az fields this depended on will need to be recomputed, not
pasted back in as-is.
