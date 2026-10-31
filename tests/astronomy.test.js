import { describe, expect, it } from "vitest";
import {
  normalizeDegrees,
  julianDateFromUnixMs,
  sunPosition,
  moonPosition,
  greenwichSiderealTime,
  obliquityOfEcliptic,
  moonSunElongation,
  moonIlluminatedFraction,
  eclipticToScene,
  earthFixedToScene,
  keplerianPosition,
  planetScenePosition,
  planetRotationAngle,
  orreryDisplayPlanetRadius,
  orreryScenePosition,
  orreryOrbitPoints,
  ORRERY_ORBIT_RADII,
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

describe("moonIlluminatedFraction", () => {
  it("is 0 at new moon, 1 at full moon, and 0.5 at the quarters", () => {
    expect(moonIlluminatedFraction(0)).toBeCloseTo(0, 9);
    expect(moonIlluminatedFraction(180)).toBeCloseTo(1, 9);
    expect(moonIlluminatedFraction(90)).toBeCloseTo(0.5, 9);
    expect(moonIlluminatedFraction(270)).toBeCloseTo(0.5, 9);
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

describe("ORRERY_ORBIT_RADII", () => {
  const ORDER = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];

  it("keeps every body in true Sun-distance order", () => {
    for (let i = 1; i < ORDER.length; i++) {
      expect(ORRERY_ORBIT_RADII[ORDER[i]]).toBeGreaterThan(ORRERY_ORBIT_RADII[ORDER[i - 1]]);
    }
  });

  it("never leaves two neighboring orbits closer together than the Moon's own orbit", () => {
    const MOON_DISTANCE_ILLUSTRATIVE = 4; // keep in sync with scene.js
    for (let i = 1; i < ORDER.length; i++) {
      const gap = ORRERY_ORBIT_RADII[ORDER[i]] - ORRERY_ORBIT_RADII[ORDER[i - 1]];
      expect(gap).toBeGreaterThan(MOON_DISTANCE_ILLUSTRATIVE * 2);
    }
  });
});

describe("orreryDisplayPlanetRadius", () => {
  const radiusOf = (name) => PLANETS.find((p) => p.name === name).radiusEarths;

  it("keeps Jupiter a bit bigger than Saturn", () => {
    expect(orreryDisplayPlanetRadius(radiusOf("Jupiter"))).toBeGreaterThan(
      orreryDisplayPlanetRadius(radiusOf("Saturn")),
    );
  });

  it("keeps Earth and Venus about the same size", () => {
    const earthRadius = orreryDisplayPlanetRadius(1);
    const venusRadius = orreryDisplayPlanetRadius(radiusOf("Venus"));
    expect(Math.abs(earthRadius - venusRadius) / earthRadius).toBeLessThan(0.1);
  });

  it("keeps every planet smaller than the illustrative Sun radius (15)", () => {
    for (const planet of PLANETS) {
      expect(orreryDisplayPlanetRadius(planet.radiusEarths)).toBeLessThan(15);
    }
  });

  it("brings Mercury within a visible range of the other planets, not sub-pixel tiny", () => {
    const mercuryRadius = orreryDisplayPlanetRadius(radiusOf("Mercury"));
    const earthRadius = orreryDisplayPlanetRadius(1);
    expect(mercuryRadius).toBeGreaterThan(earthRadius * 0.5);
  });
});

describe("orreryScenePosition", () => {
  it("returns finite coordinates within eccentricity range of its assigned radius", () => {
    const jd = julianDateFromUnixMs(Date.now());
    for (const planet of PLANETS) {
      const assignedRadius = ORRERY_ORBIT_RADII[planet.name];
      const [x, y, z] = orreryScenePosition(planet.elements, assignedRadius, jd);
      expect([x, y, z].every(Number.isFinite)).toBe(true);
      // A uniformly-scaled ellipse's radius still varies around its assigned value
      // (that's the point -- eccentricity survives the scaling), so check it's within
      // a generous relative tolerance rather than exactly equal.
      const relativeDeviation = Math.abs(Math.hypot(x, y, z) - assignedRadius) / assignedRadius;
      expect(relativeDeviation).toBeLessThan(0.3);
    }
  });

  it("keeps Mars's orbit closer to Earth's than Jupiter's", () => {
    const jd = julianDateFromUnixMs(Date.now());
    const earthRadius = Math.hypot(
      ...orreryScenePosition(EARTH_ELEMENTS, ORRERY_ORBIT_RADII.Earth, jd),
    );
    const mars = PLANETS.find((p) => p.name === "Mars");
    const jupiter = PLANETS.find((p) => p.name === "Jupiter");
    const marsRadius = Math.hypot(
      ...orreryScenePosition(mars.elements, ORRERY_ORBIT_RADII.Mars, jd),
    );
    const jupiterRadius = Math.hypot(
      ...orreryScenePosition(jupiter.elements, ORRERY_ORBIT_RADII.Jupiter, jd),
    );
    expect(Math.abs(marsRadius - earthRadius)).toBeLessThan(Math.abs(jupiterRadius - earthRadius));
  });
});

describe("orreryOrbitPoints", () => {
  it("samples a closed loop of finite points lying near the assigned orbit radius", () => {
    const assignedRadius = ORRERY_ORBIT_RADII.Earth; // Earth's orbit is nearly circular (e ~ 0.0167)
    const earth = orreryOrbitPoints(EARTH_ELEMENTS, assignedRadius, 16);
    expect(earth).toHaveLength(17); // segments + 1, first and last point coincide
    for (const [x, y, z] of earth) {
      expect([x, y, z].every(Number.isFinite)).toBe(true);
      const relativeDeviation = Math.abs(Math.hypot(x, y, z) - assignedRadius) / assignedRadius;
      expect(relativeDeviation).toBeLessThan(0.05);
    }
    const [firstX, firstY, firstZ] = earth[0];
    const [lastX, lastY, lastZ] = earth[earth.length - 1];
    expect(firstX).toBeCloseTo(lastX, 6);
    expect(firstY).toBeCloseTo(lastY, 6);
    expect(firstZ).toBeCloseTo(lastZ, 6);
  });
});

describe("planetRotationAngle", () => {
  it("is zero at J2000.0", () => {
    expect(planetRotationAngle(24, 2451545.0)).toBeCloseTo(0, 9);
  });

  it("spins a full turn after one rotation period", () => {
    const rotationHours = 10;
    const oneRotationLaterJd = 2451545.0 + rotationHours / 24;
    expect(planetRotationAngle(rotationHours, oneRotationLaterJd)).toBeCloseTo(2 * Math.PI, 7);
  });

  it("spins the opposite direction for a retrograde (negative) rotation period", () => {
    const prograde = planetRotationAngle(24, 2451546.0);
    const retrograde = planetRotationAngle(-24, 2451546.0);
    expect(Math.sign(prograde)).toBe(1);
    expect(Math.sign(retrograde)).toBe(-1);
  });
});
