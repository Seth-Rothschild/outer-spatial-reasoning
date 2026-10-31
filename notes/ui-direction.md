# UI direction

Several UI paradigms currently coexist in the viewer (illustrative vs. true scale,
scientific caption text, two instrument cards below the stage). That's a wide net —
hard to extend without something breaking. This note narrows it down before the next
round of feature work (other planets, other orbits, other viewpoints).

Audience: 5 year olds. Large blocks of text and numbers are not necessarily meaningful.

## 1. Illustrative scale becomes the primary experience

True scale stops being a user-facing toggle for now. The code behind it gets
extracted to `archive/`, not left in place and hidden -- see "Archiving" below.

Why keep the code around instead of deleting it for good:

- We're going to explore other planets, other orbits, other viewpoints, and will
  probably have to figure out how to represent those in illustrative scale too. The
  true-scale machinery (orbit lines, planet meshes, the `trueScale` blend, camera
  view goals) is likely a useful foundation for that even if it's not exposed the
  same way.
- Eventually we want viewpoints like "the Moon as seen from Earth" or "the Sun as
  seen from Mercury" -- genuinely realistic perspectives, not illustrative ones.
  That's hard and later, but it means we need to keep tracking real positions and
  real sizes in space even while the primary visual experience stays illustrative.
  True scale isn't a mode we're discarding, it's the data that makes those future
  viewpoints possible.

Implication: remove the "True scale" toggle and "Camera view" dropdown from the
control strip and from `index.html`. Extract `orbitGroup`/`planetMeshes` creation,
the `trueScale`/`trueScaleBlend` logic, and `VIEW_GOALS` out of `scene.js` into
`archive/true-scale/` (see "Archiving" below) rather than leaving them in place
behind a CSS hide.

## 2. Strip explanatory/scientific text

Remove from the active page, not simplify in place:

- The `.note` paragraph at the bottom of the page (methodology and attribution --
  Astronomical Almanac formulas, JPL elements, astropy, Natural Earth/world-atlas).
- The `.readout` info block over the top-left of the stage: Earth-Moon and
  Earth-Sun distances (km, light-sec/light-min) and the scale-description line.

No harm in archiving this too, same as sections 1 and 3: extract the markup, the
`updateReadouts()` function, and anything that becomes dead code once it's gone
(e.g. `formatInteger`, `AU_KM`/`EARTH_RADIUS_KM` if nothing else uses them) to
`archive/scientific-text/` rather than just deleting it outright.

Nothing replaces it for now -- the corner just goes empty. The UI gets rebuilt from
scratch after stripping, so there's no point designing its replacement yet.

## 3. Extract the two instrument cards, keep the logic

The moon-phase card (lit-disc SVG, phase name, next full/new moon) and the Boston
sky card (sun/moon position against the horizon) are cool but not presented the
right way for this pass. Pull them out of the active page rather than CSS-hiding
them in place.

Extract to `archive/instrument-cards/`: the `#card-phase`/`#card-boston` markup
from `index.html`, their CSS, and `litDiscPath`, `moonPhaseName`, `skyColorsAt`,
`updateCards()`, and the sky-sun/sky-moon positioning math from `ui.js`/`scene.js`.
These are candidates for a different presentation later, not dead code -- they just
shouldn't be part of the active app (or the naming/complexity passes) while that's
undecided.

## Archiving

For anything pulled out rather than deleted outright: move it to a top-level
`archive/` directory, version-controlled like everything else, but excluded from
ESLint, Prettier, Vitest, and the Vite build -- it's inert reference material, not
code we maintain. Each archived piece gets its own subfolder:

- `archive/<topic>/README.md` -- what this was, why it was pulled, and what it was
  wired into (file/function names) so reintroducing it later isn't archaeology.
- `archive/<topic>/*.js`, `*.html`, etc. -- the extracted code, close to verbatim.
  Not required to still run or import cleanly; it's a reference to adapt from, not
  a working branch of the app.

Three topics so far: `archive/true-scale/`, `archive/scientific-text/`, and
`archive/instrument-cards/`.

## Out of scope for this pass

- Actually adding other planets/orbits/viewpoints -- this note is about clearing
  space for that, not doing it yet.
- Realistic (non-illustrative) viewpoints like "Moon as seen from Earth" -- the
  reason we're keeping true-scale data alive, not something we're building now.
- Where the moon-phase/sky cards resurface, or in what form.
- Redesigning the top-left corner of the stage -- stays empty until the UI rebuild.
