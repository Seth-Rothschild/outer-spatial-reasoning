# Scientific/explanatory text

Extracted 2026-10-31. See `notes/ui-direction.md` section 2.

## What this was

Two blocks of explanatory text aimed at an adult reader:

- A readout overlay in the top-left corner of the 3D stage: the current date/time,
  Earth-Moon and Earth-Sun distances in km and light-seconds/light-minutes, and a
  one-line note about which scale mode was active.
- A methodology/attribution paragraph below the controls, crediting the
  Astronomical Almanac formulas, JPL orbital elements, astropy, and the Natural
  Earth/world-atlas land outlines.

## Why it was pulled

Target audience is a 5-year-old. He recognizes planet names; distance figures,
light-time conversions, and formula attributions aren't meaningful to him. Removed
outright rather than simplified in place -- see `notes/ui-direction.md`.

Nothing replaces the top-left corner for now; it just goes empty until the UI gets
rebuilt.

## What was removed, and from where

- `index.html`: the `.readout` div (`#r-time`, `#r-utc`, `#r-moon`, `#r-sun`,
  `#r-scale`) and the `.note` paragraph.
- `src/styles.css`: the `.readout*` rules and the `.note` rule.
- `src/scene.js`: `updateReadouts()` and its call site inside `renderFrame()`'s
  periodic-update block.
- `src/ui.js`: `formatFullDate`, `formatUtcDate`, `formatInteger` -- used only by
  `updateReadouts()`. (`formatShortDate` and `formatClockTime` are a separate
  story -- they were used by the moon-phase/Boston-sky cards, not the readout, so
  they're in `archive/instrument-cards/` instead.)
- `src/astronomy.js`: `AU_KM` and `EARTH_RADIUS_KM` stopped being exported (they're
  now internal to deriving `AU_IN_EARTH_RADII`, which the live scene still needs).
  `updateReadouts()` was their only consumer as standalone km-denominated values.

## How to bring it back

If/when the UI gets a real redesign for this audience, re-read this before
reinventing distance/time readouts -- the formulas (km, light-sec, light-min) are
still correct, just presented for the wrong audience here.
