import { describe, expect, it } from "vitest";
import {
  normalizeDegrees,
  julianDateFromUnixMs,
  sunPosition,
  moonPosition,
  greenwichSiderealTime,
  obliquityOfEcliptic,
  moonSunElongation,
  eclipticToScene,
  earthFixedToScene,
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

  it("never returns exactly 360, even when adding 360 to a tiny negative remainder rounds back up to it", () => {
    expect(normalizeDegrees(-1e-14)).toBe(0);
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
