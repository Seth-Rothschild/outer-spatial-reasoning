// Extracted from src/astronomy.js. Relied on module-level DEG, normalizeDegrees(),
// julianDateFromUnixMs(), sunPosition(), moonPosition() from the file this was cut
// from -- all of which stayed (they're used elsewhere too).

// Degrees between Moon and Sun as seen from Earth: 0 = new moon, 180 = full moon.
export function moonSunElongation(jd) {
  return normalizeDegrees(moonPosition(jd).longitude - sunPosition(jd).longitude);
}

const PHASE_SEARCH_STEP_MS = 3 * 3600e3;
const PHASE_SEARCH_MAX_STEPS = 280;
const PHASE_SEARCH_BISECTIONS = 30;

// Next Unix time (ms) at or after `fromUnixMs` when the elongation reaches
// `targetDeg` (0 = new moon, 180 = full moon). Null if none found in the next ~35 days.
export function nextMoonPhase(fromUnixMs, targetDeg) {
  const offsetFromTarget = (unixMs) =>
    ((moonSunElongation(julianDateFromUnixMs(unixMs)) - targetDeg + 540) % 360) - 180;

  let stepStart = fromUnixMs;
  let offsetAtStart = offsetFromTarget(stepStart);

  for (let step = 0; step < PHASE_SEARCH_MAX_STEPS; step++) {
    const stepEnd = stepStart + PHASE_SEARCH_STEP_MS;
    const offsetAtEnd = offsetFromTarget(stepEnd);

    const crossesTarget = offsetAtStart < 0 && offsetAtEnd >= 0 && offsetAtEnd - offsetAtStart < 90;
    if (crossesTarget) {
      let low = stepStart;
      let high = stepEnd;
      for (let i = 0; i < PHASE_SEARCH_BISECTIONS; i++) {
        const mid = (low + high) / 2;
        if (offsetFromTarget(mid) < 0) low = mid;
        else high = mid;
      }
      return (low + high) / 2;
    }

    stepStart = stepEnd;
    offsetAtStart = offsetAtEnd;
  }

  return null;
}

// The up/east/north unit vectors, in scene axes, for an observer at a given
// latitude/longitude and moment (as sidereal time + obliquity). Relied on
// earthFixedToScene(), which stayed (the Boston marker's placement doesn't use
// it, but Earth's own orientation in renderFrame() does).
export function observerFrame(latitudeDeg, longitudeDeg, siderealDeg, obliquityDeg) {
  const lat = latitudeDeg * DEG;
  const lon = longitudeDeg * DEG;

  const up = earthFixedToScene(
    [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)],
    siderealDeg,
    obliquityDeg,
  );
  const east = earthFixedToScene([-Math.sin(lon), Math.cos(lon), 0], siderealDeg, obliquityDeg);
  const north = earthFixedToScene(
    [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)],
    siderealDeg,
    obliquityDeg,
  );

  return { up, east, north };
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Altitude and azimuth (degrees) of a scene-space vector, as seen by `frame`.
export function altitudeAzimuth(frame, vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  // Clamped because floating-point rounding can push a vector pointing almost
  // exactly at the zenith/nadir just past 1 or -1, which would make asin() return NaN.
  const sinAltitude = Math.max(-1, Math.min(1, dot3(vector, frame.up) / length));
  return {
    alt: Math.asin(sinAltitude) / DEG,
    az: normalizeDegrees(Math.atan2(dot3(vector, frame.east), dot3(vector, frame.north)) / DEG),
  };
}
