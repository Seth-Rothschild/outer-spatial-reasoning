// Extracted from tests/astronomy.test.js. Covered moonSunElongation, nextMoonPhase,
// observerFrame, altitudeAzimuth -- see astronomy.js.snippet.js in this directory.
// Imports (for when this comes back): normalizeDegrees, julianDateFromUnixMs from
// the live src/astronomy.js; moonSunElongation, nextMoonPhase, observerFrame,
// altitudeAzimuth from astronomy.js.snippet.js.

import { describe, expect, it } from "vitest";

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
