# True scale (camera views, orbit lines, planet markers)

Extracted 2026-10-31. See `notes/ui-direction.md` section 1.

## What this was

A "True scale" toggle button that blended the view between illustrative scale
(Moon and Sun drawn close and big enough to interact with) and true physical scale
(real distances and sizes -- at which point Earth's shadow on the Moon, i.e.
eclipses, becomes visible). At true scale, a "Camera view" dropdown switched
between four framings: Earth close-up, Earth & Moon, Earth to Sun, and the whole
solar system (with orbit lines and the other planets as small markers).

## Why it was pulled

Illustrative scale is now the only presentation -- see `notes/ui-direction.md`.
This isn't a "we don't need this anymore" removal, though: future work wants
genuinely realistic viewpoints (e.g. "the Moon as seen from Earth", "the Sun as
seen from Mercury"), which will need real position/size data and probably a lot of
this camera/view-switching machinery, just not exposed as a toggle the way it was
here.

Note that the underlying astronomy -- `PLANETS`, `EARTH_ELEMENTS`,
`keplerianPosition()`, `planetScenePosition()` in `src/astronomy.js` -- was **not**
archived. That's general-purpose orbital math with no UI opinion baked in, and
it's exactly the "real positions and real sizes" data the future work above will
need. Only the Three.js scene/UI code that *consumed* it (orbit line rendering,
planet mesh placement, the scale toggle, the view dropdown) is here.

## What was removed, and from where

- `index.html`: the `#scale` button and `#view` select (`scene.js.snippet.js` ->
  `index.html.snippet.html`).
- `src/styles.css`: the `.tag.sun` rule (only `tagSun`, archived below, used it).
- `src/scene.js`:
  - `VIEW_GOALS`, `VIEW_TWEEN_DURATION_MS` module-level constants
  - `SUN_RADIUS_TRUE` constant (the true-scale blend target for the Sun's radius)
  - `easeInOut()` and `lerpLog()` helpers (only used for the illustrative/true
    scale blend -- once there's no blend, distances/radii are flat constants)
  - state: `trueScale`, `trueScaleBlend`, `view`, `viewGoal`, `viewTweenEndTime`
  - `goToView()`, the `scaleButton`/`viewSelect` element refs and listeners
  - `orbitGroup`, `planetMeshes`, and `buildOrbits()` (orbit line + planet mesh
    creation, called from `buildBodies()`)
  - `tagEarth`, `tagMoon`, `tagSun`, `tagPlanets` (label creation via `createTag`)
    and `placeLabels()` (their placement logic) -- these only ever showed labels
    once `trueScale` was true and zoomed in, so they're dead once `trueScale` is
    gone. (`tagBoston` and `tagSunPointer`/`updateSunPointer` are NOT part of this
    archive -- they're independent of true scale and stayed active.)
  - in `renderFrame()`: the `scaleProgress` blend math, the orbit/planet position
    update loop, and the `earth.castShadow = scaleProgress > 0.97` toggle
  - in `updateCamera()`: the `effectiveView` branching across earth/sun/system
    (collapsed to the single "moon" framing) and the view-tween block

## How to bring it back

The snippet files here are close to verbatim, not meant to still import or run
cleanly (`scene.js.snippet.js` in particular assumes module-level variables and
functions from the current `scene.js` that it was cut from). Treat it as the
starting point for a rewrite, not a drop-in patch -- especially since by the time
this comes back, `computeAstronomy()` and `updateCamera()` in the live `scene.js`
will have moved on.
