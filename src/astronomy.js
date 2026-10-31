// Positions for the Sun, Moon and planets, plus the coordinate conversions needed to
// place them in the 3D scene and to work out what's visible from a point on Earth.
//
// Sun and Moon formulas are the Astronomical Almanac's low-precision series (Moon
// accurate to about 0.3 degrees). Planets use Standish's approximate Keplerian
// elements (JPL), valid 1800-2050. Checked against astropy.

const DEG = Math.PI / 180;
const AU_KM = 149597870.7;
const EARTH_RADIUS_KM = 6371.0;
export const AU_IN_EARTH_RADII = AU_KM / EARTH_RADIUS_KM;
const J2000 = 2451545.0;

export function normalizeDegrees(degrees) {
  let wrapped = degrees % 360;
  if (wrapped < 0) wrapped += 360;
  // Adding 360 to a tiny negative remainder can round back up to exactly 360.
  return wrapped >= 360 ? 0 : wrapped;
}

export function julianDateFromUnixMs(unixMs) {
  return unixMs / 86400000 + 2440587.5;
}

// ---- Sun and Moon ----------------------------------------------------------------

// Geocentric, ecliptic-of-date. Longitude in degrees, distance in AU.
export function sunPosition(jd) {
  const daysSinceJ2000 = jd - J2000;
  const meanLongitude = 280.46 + 0.9856474 * daysSinceJ2000;
  const meanAnomaly = (357.528 + 0.9856003 * daysSinceJ2000) * DEG;

  const longitude =
    meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly);
  const distanceAu =
    1.00014 - 0.01671 * Math.cos(meanAnomaly) - 0.00014 * Math.cos(2 * meanAnomaly);

  return { longitude: normalizeDegrees(longitude), distanceAu };
}

// Geocentric, ecliptic-of-date. Longitude/latitude in degrees, distance in Earth radii.
export function moonPosition(jd) {
  const t = (jd - J2000) / 36525; // Julian centuries since J2000
  const sin = (baseDeg, perCentury) => Math.sin((baseDeg + perCentury * t) * DEG);
  const cos = (baseDeg, perCentury) => Math.cos((baseDeg + perCentury * t) * DEG);

  const longitude =
    218.32 +
    481267.881 * t +
    6.29 * sin(135.0, 477198.87) -
    1.27 * sin(259.3, -413335.36) +
    0.66 * sin(235.7, 890534.22) +
    0.21 * sin(269.9, 954397.74) -
    0.19 * sin(357.5, 35999.05) -
    0.11 * sin(186.5, 966404.03);

  const latitude =
    5.13 * sin(93.3, 483202.02) +
    0.28 * sin(228.2, 960400.89) -
    0.28 * sin(318.3, 6003.15) -
    0.17 * sin(217.6, -407332.21);

  const parallax =
    0.9508 +
    0.0518 * cos(135.0, 477198.87) +
    0.0095 * cos(259.3, -413335.36) +
    0.0078 * cos(235.7, 890534.22) +
    0.0028 * cos(269.9, 954397.74);

  return {
    longitude: normalizeDegrees(longitude),
    latitude,
    distanceEarthRadii: 1 / Math.sin(parallax * DEG),
  };
}

export function greenwichSiderealTime(jd) {
  return normalizeDegrees(280.46061837 + 360.98564736629 * (jd - J2000));
}

export function obliquityOfEcliptic(jd) {
  return 23.4392911 - 0.0130042 * ((jd - J2000) / 36525);
}

// ---- Coordinate frames ------------------------------------------------------------
// Scene axes: x points toward the vernal equinox, y toward the north ecliptic pole,
// z = -y-of-ecliptic (so x/y/z form the right-handed frame Three.js expects).

export function eclipticToScene(longitudeDeg, latitudeDeg, radius) {
  const lon = longitudeDeg * DEG;
  const lat = latitudeDeg * DEG;
  const horizontal = radius * Math.cos(lat);
  return [horizontal * Math.cos(lon), radius * Math.sin(lat), -horizontal * Math.sin(lon)];
}

// Earth-fixed (x toward lon 0/lat 0, z toward the north pole) -> scene axes, for a
// given Greenwich sidereal angle and obliquity of date.
export function earthFixedToScene(vector, siderealDeg, obliquityDeg) {
  const theta = siderealDeg * DEG;
  const cosObliquity = Math.cos(obliquityDeg * DEG);
  const sinObliquity = Math.sin(obliquityDeg * DEG);

  const equatorialX = vector[0] * Math.cos(theta) - vector[1] * Math.sin(theta);
  const equatorialY = vector[0] * Math.sin(theta) + vector[1] * Math.cos(theta);
  const equatorialZ = vector[2];

  return [
    equatorialX,
    -equatorialY * sinObliquity + equatorialZ * cosObliquity,
    -(equatorialY * cosObliquity + equatorialZ * sinObliquity),
  ];
}

// ---- Planets (Keplerian elements) --------------------------------------------------
// Each row is [a, da, e, de, I, dI, L, dL, longPeri, dLongPeri, longNode, dLongNode]
// per Julian century: semi-major axis (AU), eccentricity, inclination, mean longitude,
// longitude of perihelion, longitude of ascending node (angles in degrees).

export const PLANETS = [
  {
    name: "Mercury",
    color: 0xb8b2a8,
    radiusEarths: 0.383,
    elements: [
      0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.2503235,
      149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081,
    ],
  },
  {
    name: "Venus",
    color: 0xe8cf9a,
    radiusEarths: 0.949,
    elements: [
      0.72333566, 0.0000039, 0.00677672, -0.00004107, 3.39467605, -0.0007889, 181.9790995,
      58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418,
    ],
  },
  {
    name: "Mars",
    color: 0xd9694a,
    radiusEarths: 0.532,
    elements: [
      1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205,
      19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343,
    ],
  },
  {
    name: "Jupiter",
    color: 0xd8b48a,
    radiusEarths: 11.21,
    elements: [
      5.202887, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051,
      3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106,
    ],
  },
  {
    name: "Saturn",
    color: 0xe6d29c,
    radiusEarths: 9.45,
    elements: [
      9.53667594, -0.0012506, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423,
      1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794,
    ],
  },
  {
    name: "Uranus",
    color: 0x9fd8e0,
    radiusEarths: 4.01,
    elements: [
      19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451,
      428.48202785, 170.9542763, 0.40805281, 74.01692503, 0.04240589,
    ],
  },
  {
    name: "Neptune",
    color: 0x6f8fe8,
    radiusEarths: 3.88,
    elements: [
      30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969,
      218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664,
    ],
  },
];

export const EARTH_ELEMENTS = [
  1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166,
  35999.37244981, 102.93768193, 0.32327364, 0.0, 0.0,
];

// Solves Kepler's equation for eccentric anomaly `E` from mean anomaly, then returns
// the heliocentric ecliptic J2000 position in AU. Pass `eccentricAnomaly` directly
// (e.g. to trace a full orbit) instead of solving for it by setting `fromMeanAnomaly: false`.
export function keplerianPosition(
  elements,
  centuriesSinceJ2000,
  eccentricAnomaly,
  fromMeanAnomaly,
) {
  const t = centuriesSinceJ2000;
  const [a0, da, e0, de, i0, di, l0, dl, peri0, dperi, node0, dnode] = elements;
  const semiMajorAxis = a0 + da * t;
  const eccentricity = e0 + de * t;
  const inclination = (i0 + di * t) * DEG;
  const meanLongitude = l0 + dl * t;
  const longitudeOfPerihelion = peri0 + dperi * t;
  const longitudeOfNode = (node0 + dnode * t) * DEG;
  const argumentOfPerihelion = longitudeOfPerihelion * DEG - longitudeOfNode;

  let E = eccentricAnomaly;
  if (fromMeanAnomaly) {
    let meanAnomaly = normalizeDegrees(meanLongitude - longitudeOfPerihelion) * DEG;
    if (meanAnomaly > Math.PI) meanAnomaly -= 2 * Math.PI;
    E = meanAnomaly + eccentricity * Math.sin(meanAnomaly);
    for (let i = 0; i < 8; i++) {
      E -= (E - eccentricity * Math.sin(E) - meanAnomaly) / (1 - eccentricity * Math.cos(E));
    }
  }

  // Position in the orbital plane, then rotated into the ecliptic.
  const xOrbit = semiMajorAxis * (Math.cos(E) - eccentricity);
  const yOrbit = semiMajorAxis * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(E);
  const cosW = Math.cos(argumentOfPerihelion),
    sinW = Math.sin(argumentOfPerihelion);
  const cosNode = Math.cos(longitudeOfNode),
    sinNode = Math.sin(longitudeOfNode);
  const cosI = Math.cos(inclination),
    sinI = Math.sin(inclination);

  return [
    (cosW * cosNode - sinW * sinNode * cosI) * xOrbit +
      (-sinW * cosNode - cosW * sinNode * cosI) * yOrbit,
    (cosW * sinNode + sinW * cosNode * cosI) * xOrbit +
      (-sinW * sinNode + cosW * cosNode * cosI) * yOrbit,
    sinW * sinI * xOrbit + cosW * sinI * yOrbit,
  ];
}

// Heliocentric position of a planet in scene axes (x, z, -y), in Earth radii.
export function planetScenePosition(planet, jd) {
  const centuriesSinceJ2000 = (jd - J2000) / 36525;
  const [x, y, z] = keplerianPosition(planet.elements, centuriesSinceJ2000, 0, true);
  return [x * AU_IN_EARTH_RADII, z * AU_IN_EARTH_RADII, -y * AU_IN_EARTH_RADII];
}
