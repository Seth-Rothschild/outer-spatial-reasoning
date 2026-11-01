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
// A second, deliberately non-epoch date: J2000.0 zeroes out every "per Julian century"
// rate term in these formulas (jd - J2000 = 0), so a test that only ever checks J2000.0
// can't tell a correct rate coefficient from a mutated one -- that term's contribution
// is zero either way. This date gives those rate terms (and the rotation-matrix terms
// in keplerianPosition, similarly trivialized by zero inclination/node/periapsis in the
// circular-orbit test below) something nonzero to act on.
const SECOND_DATE_JD = julianDateFromUnixMs(Date.UTC(2024, 0, 1, 0, 0, 0));

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

  it("matches known longitude and distance away from the epoch", () => {
    const { longitude, distanceAu } = sunPosition(SECOND_DATE_JD);
    expect(longitude).toBeCloseTo(280.0434102292238, 9);
    expect(distanceAu).toBeCloseTo(0.9833168024645882, 9);
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

  it("matches known longitude, latitude, and distance away from the epoch", () => {
    const { longitude, latitude, distanceEarthRadii } = moonPosition(SECOND_DATE_JD);
    expect(longitude).toBeCloseTo(156.00013852598204, 9);
    expect(latitude).toBeCloseTo(3.5223623915212037, 9);
    expect(distanceEarthRadii).toBeCloseTo(63.44635340534354, 9);
  });
});

describe("greenwichSiderealTime", () => {
  it("matches the known value at J2000.0", () => {
    expect(greenwichSiderealTime(2451545.0)).toBeCloseTo(280.46061837, 5);
  });

  it("matches the known value away from the epoch, where the per-century rate matters", () => {
    expect(greenwichSiderealTime(SECOND_DATE_JD)).toBeCloseTo(100.15260758483782, 9);
  });
});

describe("obliquityOfEcliptic", () => {
  it("matches the known value at J2000.0", () => {
    expect(obliquityOfEcliptic(2451545.0)).toBeCloseTo(23.4392911, 7);
  });

  it("matches the known value away from the epoch, where the per-century rate matters", () => {
    expect(obliquityOfEcliptic(SECOND_DATE_JD)).toBeCloseTo(23.436170270017794, 9);
  });
});

describe("moonSunElongation", () => {
  it("stays within [0, 360)", () => {
    const jd = julianDateFromUnixMs(Date.now());
    const elongation = moonSunElongation(jd);
    expect(elongation).toBeGreaterThanOrEqual(0);
    expect(elongation).toBeLessThan(360);
  });

  it("matches the known value away from the epoch", () => {
    expect(moonSunElongation(SECOND_DATE_JD)).toBeCloseTo(235.95672829675823, 9);
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

  it("matches a known value off both axes, where the lon/lat cross terms matter", () => {
    const [x, y, z] = eclipticToScene(45, 10, 100);
    expect(x).toBeCloseTo(69.6364240320019, 9);
    expect(y).toBeCloseTo(17.364817766693033, 9);
    expect(z).toBeCloseTo(-69.63642403200188, 9);
  });
});

describe("earthFixedToScene", () => {
  it("is the identity when sidereal time and obliquity are both zero", () => {
    const [x, y, z] = earthFixedToScene([3, -1, 2], 0, 0);
    expect(x).toBeCloseTo(3, 9);
    expect(y).toBeCloseTo(2, 9);
    expect(z).toBeCloseTo(1, 9);
  });

  // Zero sidereal time and obliquity (above) trivialize every sin/cos in the formula
  // to exactly 0 or 1, so a mutated coefficient or sign there would go undetected.
  // These two nonzero cases together exercise both input axes the identity case left
  // untouched (vector[2], here, and vector[0]/vector[1], in the second case).
  it("matches a known value at a nonzero sidereal time and obliquity", () => {
    const [x, y, z] = earthFixedToScene([1, 0, 0], 30, 23.4);
    expect(x).toBeCloseTo(0.8660254037844387, 9);
    expect(y).toBeCloseTo(-0.19857394531739025, 9);
    expect(z).toBeCloseTo(-0.4588773128419905, 9);
  });

  it("matches a known value for a vector along the Earth-fixed z-axis", () => {
    const [x, y, z] = earthFixedToScene([0, 0, 1], 30, 23.4);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0.9177546256839811, 9);
    expect(z).toBeCloseTo(-0.39714789063478056, 9);
  });

  // The two cases above both pass a zero vector[1], which hides the vector[1] terms
  // in the equatorial-rotation formula entirely. A vector along the y-axis exercises
  // exactly those.
  it("matches a known value for a vector along the Earth-fixed y-axis", () => {
    const [x, y, z] = earthFixedToScene([0, 1, 0], 30, 23.4);
    expect(x).toBeCloseTo(-0.49999999999999994, 9);
    expect(y).toBeCloseTo(-0.34394016234912395, 9);
    expect(z).toBeCloseTo(-0.7947988202830062, 9);
  });
});

describe("keplerianPosition", () => {
  it("places a circular, unperturbed orbit at the expected radius", () => {
    const circularElements = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const [x, y, z] = keplerianPosition(circularElements, 0, 0, false);
    expect(Math.hypot(x, y, z)).toBeCloseTo(2, 9);
    expect(z).toBeCloseTo(0, 9); // zero inclination stays in the reference plane
  });

  // The case above uses all-zero inclination/node/periapsis, which trivializes the
  // whole orbital-plane-to-ecliptic rotation matrix to the identity -- a mutated sign
  // or term in that matrix wouldn't be caught there. Real planet elements (nonzero on
  // every angle) exercise the actual rotation. Every planet gets its own exact check,
  // not just one -- each has its own independent set of coefficients to pin.
  it("matches a known heliocentric position for every planet away from the epoch", () => {
    const centuriesSinceJ2000 = (SECOND_DATE_JD - 2451545) / 36525;
    const knownPositions = {
      Mercury: [-0.2746334288066042, 0.2003511051788704, 0.041563215232315334],
      Venus: [-0.7152549239516144, -0.07662348493756888, 0.04021994119239692],
      Mars: [-0.29365230975677714, -1.4510989212421042, -0.023206775603120375],
      Jupiter: [3.496023995961914, 3.550127607970441, -0.0929972225310659],
      Saturn: [8.992092982083015, -3.701311604100978, -0.2935052824761492],
      Uranus: [12.261544258686367, 15.298015924114607, -0.1021243769176288],
      Neptune: [29.835792471534223, -1.7931942003014196, -0.6506284830916513],
    };
    for (const planet of PLANETS) {
      const [x, y, z] = keplerianPosition(planet.elements, centuriesSinceJ2000, 0, true);
      const [knownX, knownY, knownZ] = knownPositions[planet.name];
      expect(x).toBeCloseTo(knownX, 9);
      expect(y).toBeCloseTo(knownY, 9);
      expect(z).toBeCloseTo(knownZ, 9);
    }
  });

  it("matches a known heliocentric position for Earth away from the epoch", () => {
    const centuriesSinceJ2000 = (SECOND_DATE_JD - 2451545) / 36525;
    const [x, y, z] = keplerianPosition(EARTH_ELEMENTS, centuriesSinceJ2000, 0, true);
    expect(x).toBeCloseTo(-0.16588797901109412, 9);
    expect(y).toBeCloseTo(0.9692363666128861, 9);
    expect(z).toBeCloseTo(-0.00005281857755044795, 9);
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

  it("matches a known scene position for Jupiter away from the epoch", () => {
    const jupiter = PLANETS.find((p) => p.name === "Jupiter");
    const [x, y, z] = planetScenePosition(jupiter, SECOND_DATE_JD);
    expect(x).toBeCloseTo(82090.36975545561, 6);
    expect(y).toBeCloseTo(-2183.673908595436, 6);
    expect(z).toBeCloseTo(-83360.78023319138, 6);
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

  it("matches known assigned radii, pinning the compression curve's constants", () => {
    expect(ORRERY_ORBIT_RADII.Mercury).toBeCloseTo(39.9547683609414, 9);
    expect(ORRERY_ORBIT_RADII.Jupiter).toBeCloseTo(75.9547683609414, 9);
    // Uranus/Neptune are the two bodies where the minimum-gap floor actually kicks
    // in over the raw sqrt curve (see ORRERY_MIN_GAP_EARTHS) -- pinning these catches
    // a mutation to that floor as well as to the base curve.
    expect(ORRERY_ORBIT_RADII.Uranus).toBeCloseTo(100.08870199853897, 9);
    expect(ORRERY_ORBIT_RADII.Neptune).toBeCloseTo(117.73767848854904, 9);
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

  it("matches a known value, pinning the base/spacing constants themselves", () => {
    expect(orreryDisplayPlanetRadius(11.21)).toBeCloseTo(1.9392535234226567, 9);
  });
});

describe("orreryScenePosition", () => {
  it("matches a known scene position for Jupiter away from the epoch", () => {
    const jupiter = PLANETS.find((p) => p.name === "Jupiter");
    const [x, y, z] = orreryScenePosition(
      jupiter.elements,
      ORRERY_ORBIT_RADII.Jupiter,
      SECOND_DATE_JD,
    );
    expect(x).toBeCloseTo(51.03699019363287, 9);
    expect(y).toBeCloseTo(-1.3576275047983997, 9);
    expect(z).toBeCloseTo(-51.8268261669296, 9);
  });

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
  it("matches known sampled points for an eccentric, inclined orbit (Jupiter)", () => {
    const jupiter = PLANETS.find((p) => p.name === "Jupiter");
    const points = orreryOrbitPoints(jupiter.elements, ORRERY_ORBIT_RADII.Jupiter, 4);
    expect(points).toEqual([
      [69.88623597521348, -1.6408426376253633, -18.37287741629133],
      [-22.840060869110555, 0.21155486472969756, -72.43903437235203],
      [-76.99317857888771, 1.8077048857424434, 20.241270862294563],
      [15.733118265436314, -0.04469261661261705, 74.30742781835527],
      [69.88623597521348, -1.6408426376253633, -18.372877416291313],
    ]);
  });

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

  // The generic +/-24 cases above never touch PLANETS itself, so a sign flip on a
  // specific planet's own rotationHours (Venus and Uranus are the two retrograde
  // spinners) would go unnoticed.
  it("spins Venus and Uranus retrograde using their actual rotationHours", () => {
    const venus = PLANETS.find((p) => p.name === "Venus");
    const uranus = PLANETS.find((p) => p.name === "Uranus");
    expect(Math.sign(planetRotationAngle(venus.rotationHours, 2451546.0))).toBe(-1);
    expect(Math.sign(planetRotationAngle(uranus.rotationHours, 2451546.0))).toBe(-1);
  });
});
