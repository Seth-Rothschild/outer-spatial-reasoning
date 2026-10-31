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
