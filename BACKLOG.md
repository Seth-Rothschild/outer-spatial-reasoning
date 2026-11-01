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

- **Moon flips over during day-shuffling**: root cause identified. In
  `src/scene.js`'s `renderFrame`, the Moon's orientation is set each frame with
  `moon.quaternion.setFromUnitVectors(X_AXIS, moonDirection.clone().negate())`
  (scene.js:959). THREE's `setFromUnitVectors` has a special-case branch for
  when the two vectors are nearly antiparallel (`vFrom.dot(vTo) + 1 <
  EPSILON`), which picks an arbitrary perpendicular axis instead of the smooth
  cross-product one used everywhere else. That triggers whenever the Moon's
  direction from Earth swings close to `+X` in scene axes -- a configuration
  it passes through roughly once per lunar orbit (~27.3 days) -- producing a
  visible discontinuous "twist" of the textured sphere right at that crossing,
  which reads as the Moon flipping. Leaning toward replacing the single
  `setFromUnitVectors` call with a proper look-basis (forward = Earth
  direction from Moon, a fixed world "up" for roll, right = their cross
  product) built into a rotation matrix -- the real Moon's orbit stays close
  to the ecliptic, so that basis would only hit its own singularity if the
  Moon's direction ever aligned with the chosen up vector, which doesn't
  happen.

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

- **Date/time display should be bigger and more central**: currently
  `#r-time` sits as small text off to the side in the top control strip
  (index.html), despite being, per the user, one of the most compelling parts
  of the experience. Wants a real layout/typography pass rather than just a
  font-size bump -- good to bundle with other HUD layout work rather than
  doing in isolation.

- **Boston marker is too big**: the dot marking Boston on the globe reads as
  oversized relative to Earth. `boston.scale` is set each frame in
  `placeBostonTag` (scene.js) from a fixed pixel-size target (`4 *
  bostonWorldPos.distanceTo(camera.position) * fovTan / (viewportHeight / 2)`)
  -- worth revisiting that constant, or the underlying sphere geometry's radius
  relative to Earth's.

- **Time control should be a chunky scrub wheel under the canvas, with a bigger
  centered "now" readout up top**: feature idea, not yet started. Two pieces:
  (1) replace the small `−1 day` / `+1 day` buttons in `.datebar` (index.html:139-145)
  with a large, physical-feeling scrub wheel as a main UI component directly below
  the canvas view (`#stage`, index.html:101-116) -- something you drag or flick to
  move backwards and forwards through simulated time, rather than tapping day-jump
  buttons one at a time. (2) move `#r-time` (index.html:59), which currently sits as
  small text tucked inside the `now-toggle` header button alongside the phase icon,
  to a larger, centered "what date and time is it now" readout at the top of the
  screen -- this is the same display flagged in "Date/time display should be
  bigger and more central" above, so these should land together rather than as
  separate passes. Worth deciding whether the scrub wheel replaces the datebar's
  day-jump buttons outright or just supplements them, and whether scrubbing should
  pause live playback while dragging.
