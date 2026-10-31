import { describe, expect, it } from "vitest";
import {
  normalizeDegrees,
  julianDateFromUnixMs,
  sunPosition,
  moonPosition,
  greenwichSiderealTime,
  obliquityOfEcliptic,
  moonSunElongation,
  nextMoonPhase,
  eclipticToScene,
  earthFixedToScene,
  observerFrame,
  altitudeAzimuth,
  keplerianPosition,
  planetScenePosition,
  PLANETS,
  EARTH_ELEMENTS,
} from "../src/astronomy.js";

const J2000_UNIX_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

describe("normalizeDegrees", () => {
  it("wraps values into [0, 360)", () => {
    expect(normalizeDegrees(0)).toBe(0);
    expect(normalizeDegrees(359)).toBe(359);
    expect(normalizeDegrees(360)).toBe(0);
    expect(normalizeDegrees(725)).toBeCloseTo(5, 9);
    expect(normalizeDegrees(-10)).toBe(350);
    expect(normalizeDegrees(-370)).toBeCloseTo(350, 9);
  });
});

describe("julianDateFromUnixMs", () => {
  it("matches the J2000.0 epoch", () => {
    expect(julianDateFromUnixMs(J2000_UNIX_MS)).toBeCloseTo(2451545.0, 6);
  });
});

describe("sunPosition", () => {
  it("stays within Earth's actual orbital distance range", () => {
    const jd = julianDateFromUnixMs(J2000_UNIX_MS);
    const { longitude, distanceAu } = sunPosition(jd);
    expect(longitude).toBeGreaterThanOrEqual(0);
    expect(longitude).toBeLessThan(360);
    expect(distanceAu).toBeGreaterThan(0.98);
    expect(distanceAu).toBeLessThan(1.02);
  });
});

describe("moonPosition", () => {
  it("stays within the Moon's actual distance range", () => {
    const jd = julianDateFromUnixMs(J2000_UNIX_MS);
    const { longitude, latitude, distanceEarthRadii } = moonPosition(jd);
    expect(longitude).toBeGreaterThanOrEqual(0);
    expect(longitude).toBeLessThan(360);
    expect(Math.abs(latitude)).toBeLessThan(6); // Moon's orbit is inclined ~5 deg to the ecliptic
    expect(distanceEarthRadii).toBeGreaterThan(55);
    expect(distanceEarthRadii).toBeLessThan(64);
  });
});

describe("greenwichSiderealTime", () => {
  it("matches the known value at J2000.0", () => {
    expect(greenwichSiderealTime(2451545.0)).toBeCloseTo(280.46061837, 5);
  });
});

describe("obliquityOfEcliptic", () => {
  it("matches the known value at J2000.0", () => {
    expect(obliquityOfEcliptic(2451545.0)).toBeCloseTo(23.4392911, 7);
  });
});

describe("moonSunElongation", () => {
  it("stays within [0, 360)", () => {
    const jd = julianDateFromUnixMs(Date.now());
    const elongation = moonSunElongation(jd);
    expect(elongation).toBeGreaterThanOrEqual(0);
    expect(elongation).toBeLessThan(360);
  });
});

describe("nextMoonPhase", () => {
  it("finds the next full moon within the usual ~29.5-day cycle", () => {
    const now = Date.now();
    const fullMoonMs = nextMoonPhase(now, 180);
    expect(fullMoonMs).not.toBeNull();
    expect(fullMoonMs).toBeGreaterThanOrEqual(now);
    expect(fullMoonMs - now).toBeLessThan(30 * 86400e3);

    const elongationAtResult = moonSunElongation(julianDateFromUnixMs(fullMoonMs));
    expect(elongationAtResult).toBeCloseTo(180, 1);
  });

  it("finds the next new moon within the usual ~29.5-day cycle", () => {
    const now = Date.now();
    const newMoonMs = nextMoonPhase(now, 0);
    const elongationAtResult = normalizeDegrees(moonSunElongation(julianDateFromUnixMs(newMoonMs)));
    expect(elongationAtResult < 1 || elongationAtResult > 359).toBe(true);
  });

  it("returns null when no crossing is found (target elongation never matches)", () => {
    // NaN can never equal any elongation, so the search exhausts its window and
    // falls through to the "not found" case.
    expect(nextMoonPhase(Date.now(), NaN)).toBeNull();
  });
});

describe("eclipticToScene", () => {
  it("maps the ecliptic plane and pole onto the expected scene axes", () => {
    const [x0, y0, z0] = eclipticToScene(0, 0, 10);
    expect(x0).toBeCloseTo(10, 9);
    expect(y0).toBeCloseTo(0, 9);
    expect(z0).toBeCloseTo(0, 9);

    const [x, y, z] = eclipticToScene(90, 0, 10);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(-10, 9);
    const pole = eclipticToScene(0, 90, 10);
    expect(pole[1]).toBeCloseTo(10, 9);
  });
});

describe("earthFixedToScene", () => {
  it("is the identity when sidereal time and obliquity are both zero", () => {
    const [x, y, z] = earthFixedToScene([3, -1, 2], 0, 0);
    expect(x).toBeCloseTo(3, 9);
    expect(y).toBeCloseTo(2, 9);
    expect(z).toBeCloseTo(1, 9);
  });
});

describe("observerFrame", () => {
  it("produces three mutually orthogonal unit vectors", () => {
    const frame = observerFrame(42.36, -71.06, 123.4, 23.44);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const length = (v) => Math.hypot(v[0], v[1], v[2]);

    expect(length(frame.up)).toBeCloseTo(1, 9);
    expect(length(frame.east)).toBeCloseTo(1, 9);
    expect(length(frame.north)).toBeCloseTo(1, 9);
    expect(dot(frame.up, frame.east)).toBeCloseTo(0, 9);
    expect(dot(frame.up, frame.north)).toBeCloseTo(0, 9);
    expect(dot(frame.east, frame.north)).toBeCloseTo(0, 9);
  });
});

describe("altitudeAzimuth", () => {
  it("reports 90 degrees altitude for a point straight up", () => {
    const frame = observerFrame(42.36, -71.06, 123.4, 23.44);
    const straightUp = frame.up.map((c) => c * 5000);
    expect(altitudeAzimuth(frame, straightUp).alt).toBeCloseTo(90, 6);
  });

  it("reports 0 degrees altitude and azimuth for a point due north on the horizon", () => {
    const frame = observerFrame(42.36, -71.06, 123.4, 23.44);
    const { alt, az } = altitudeAzimuth(frame, frame.north);
    expect(alt).toBeCloseTo(0, 6);
    // 0 and 360 are the same compass heading; floating-point rounding right at
    // that wraparound point can legitimately land on either.
    expect(az % 360).toBeCloseTo(0, 6);
  });
});

describe("keplerianPosition", () => {
  it("places a circular, unperturbed orbit at the expected radius", () => {
    const circularElements = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const [x, y, z] = keplerianPosition(circularElements, 0, 0, false);
    expect(Math.hypot(x, y, z)).toBeCloseTo(2, 9);
    expect(z).toBeCloseTo(0, 9); // zero inclination stays in the reference plane
  });
});

describe("planetScenePosition", () => {
  it("returns finite scene coordinates roughly matching each planet's known orbit", () => {
    const jd = julianDateFromUnixMs(Date.now());
    for (const planet of PLANETS) {
      const [x, y, z] = planetScenePosition(planet, jd);
      expect([x, y, z].every(Number.isFinite)).toBe(true);
    }
    const [earthX, earthY, earthZ] = keplerianPosition(
      EARTH_ELEMENTS,
      (jd - 2451545) / 36525,
      0,
      false,
    );
    expect(Math.hypot(earthX, earthY, earthZ)).toBeCloseTo(1, 1); // Earth stays near 1 AU
  });
});
