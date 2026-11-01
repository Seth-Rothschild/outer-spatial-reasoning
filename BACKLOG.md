# Backlog

- **Orrery orbits can visually overlap**: eccentricity is drawn true-to-shape (just
  scaled to the assigned orbit radius), so a planet with real eccentricity can swing
  close enough to a neighbor's orbit to overlap it -- mainly Mercury (e ~0.21), which
  can swing within the gap enforced in ORRERY_ORBIT_RADII. Everything else is close to
  circular already (Mars is the next worst at ~0.09), so this is really a one-planet
  problem. Leaning toward damping eccentricity in the display (e.g. compress it the
  same way distance/size already are, rather than widening every orbit's gap just to
  cover Mercury's worst case) -- cheaper in screen space and consistent with the
  existing "illustrative, not literal" approach to distance and size.

- **Viewport pans/swings when fast-forwarding days in the Moon-from-Earth
  view**: by design, not an accident, and still present after the view
  selector was reworked to add per-planet viewpoints (the view is now named
  `moonFromEarth`, button `#view-moonFromEarth`, same underlying
  `EARTH_TOWARD_MOON` object). Its default camera yaw is derived from the
  Moon's live direction from Earth (`frameToward`), recomputed fresh every
  frame with no smoothing (`updateCamera`, scene.js:878-911; see the design
  comment at scene.js:76-91). Advancing simulated time quickly -- the day-jump
  buttons, or just letting it run at a faster speed -- sweeps that baseline
  yaw around Earth at the same rate the Moon completes its orbit, which reads
  as the camera itself panning left/right rather than Earth staying put.
  `cameraDistance` is already eased toward its goal each frame (the
  `cameraStep`/`Math.exp` lerp just above); the baseline yaw isn't. Leaning
  toward applying that same kind of easing to the baseline yaw/pitch so a
  sudden time jump doesn't instantly whip the camera around.

- **Sun's default view is too tight**: `SUN_NEAR` (scene.js:158-163) is built
  with the same shared `nearSideTowardSun` helper every planet's near-side
  view uses, so its framing distance is `SUN_RADIUS_ILLUSTRATIVE *
PLANET_NEAR_SIDE_DISTANCE_FACTOR` -- the same 4x-display-radius factor as
  Mercury, Earth, Jupiter, etc. But `SUN_RADIUS_ILLUSTRATIVE` (scene.js:66) is
  already inflated well past the Sun's true relative size specifically so it
  reads clearly next to the planets, so multiplying that already-inflated
  radius by the same factor every planet uses leaves the default Sun view
  looking noticeably more zoomed-in than the planets' own near-side views.
  Leaning toward giving the Sun its own, larger distance factor (or
  overriding `distance` directly on `SUN_NEAR`) rather than touching
  `PLANET_NEAR_SIDE_DISTANCE_FACTOR`, since the planets already look right at
  4x.

- **Re-introduce faster playback speeds**: `#speed` in index.html currently
  offers only "Real time" (1) and "1 hour / sec" (3600). Faster options --
  6 hours/sec, 1 day/sec, 3 days/sec, 10 days/sec -- existed before commit
  5afe3b9 ("feat: default playback to real time") and were deliberately
  trimmed down to two options when real-time playback became the default on
  load, not lost by accident. `simulatedMs` just advances by
  `speedSecondsPerSecond * 1000 * dt` each frame (scene.js:1001) however big
  that number is, so re-adding options is mostly restoring the `<option>`
  list; worth doing after the Moon-from-Earth viewport-panning item above,
  since that panning gets more visible the faster the Moon sweeps through
  its orbit.

- **View-selector order breaks down once a body has more than one
  viewpoint**: the view buttons (index.html:130-141, `VIEWPOINTS` at
  scene.js:196-208) are ordered Sun-outward -- Sun, Mercury, Venus, Earth,
  Moon, Moon from Earth, Mars, Jupiter, Saturn, Uranus, Neptune -- with
  Earth's two extra views grouped in next to Earth. That's a deliberate
  choice (see the ordering comment at scene.js:190-195), but it breaks the
  simple "the buttons are the planets, in order" mental model a child clicking
  through them builds up, since Mars doesn't come right after Earth the way
  he'd expect. Leaning toward separating "which body" from "which view of
  that body" -- e.g. a planet-order strip plus a secondary per-body view
  toggle for bodies that have more than one view -- rather than keeping it as
  one flat button row, so adding more alternate views (for other planets'
  moons, say) doesn't keep disrupting the planet order.

- **Add the five dwarf planets** (Pluto, Ceres, Haumea, Makemake, Eris): runs
  into the same view-selector ordering problem above, but worse -- Ceres
  belongs in the asteroid belt between Mars and Jupiter, while Pluto, Haumea,
  Makemake, and Eris are all out past Neptune in their own, different order
  by distance, not one single "9th planet" slot. Needs the data model
  extended (`PLANETS` in astronomy.js:133, plus `VIEWPOINTS` and
  `orreryDisplayPlanetRadius` in scene.js) and the view-selector ordering
  question above resolved first, since dropping five more buttons into the
  existing flat row would only make that confusion worse.

- **Moon should only render in Earth-related views**: `moon` is added
  directly to `scene` rather than parented under `earthSystem`, specifically
  so its world position can be set explicitly each frame (scene.js:382), and
  nothing currently toggles `moon.visible` -- it's positioned and drawn every
  frame regardless of which Viewpoint is active, not just the three that are
  actually about the Moon (`earth`, `moon`, `moonFromEarth`). Leaning toward
  setting `moon.visible` from `activeViewpointKey` the same place
  `setActiveViewpoint` already toggles `phaseInfo.hidden` by key
  (scene.js:650), rather than adding a separate visibility check elsewhere.

- **Generalize the one-off label/callout system** to cover more "cool stuff"
  than just Boston and the Sun arrow -- sunrise/sunset, moonrise, perihelion/
  aphelion, etc. Right now each of those is its own bespoke pairing: a
  `createTag` call (scene.js:584-599) plus a hand-written placement function
  (`placeBostonTag`, scene.js:875, or the Sun-pointer logic nearby) built on
  top of the shared `placeTag` (scene.js:849), which already does the real
  work of projecting a world point to screen space and deciding whether to
  show it. Adding each new "interesting moment" badge the same way means
  writing another bespoke tag + placement function per badge. Leaning toward
  a declarative list of callouts -- each one a label, an anchor (a world
  point, or a time-based condition like "it's currently sunrise in Boston" or
  "Earth is near perihelion"), and which Viewpoints it's relevant in -- driven
  through the existing `placeTag` instead of one-off functions, so the next
  badge is a data entry, not new placement code.
