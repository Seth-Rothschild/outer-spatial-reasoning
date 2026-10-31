// Extracted from tests/ui.test.js. Covered litDiscPath, moonPhaseName, skyColorsAt,
// rgbCss, compassDirection -- see ui.js.snippet.js in this directory.

import { describe, expect, it } from "vitest";

describe("moonPhaseName", () => {
  it.each([
    [0, "New moon"],
    [9.9, "New moon"],
    [10, "Waxing crescent"],
    [90, "First quarter"],
    [150, "Waxing gibbous"],
    [180, "Full moon"],
    [220, "Waning gibbous"],
    [270, "Last quarter"],
    [349.9, "Waning crescent"],
    [350, "New moon"],
  ])("names %f degrees of elongation as %s", (elongation, expected) => {
    expect(moonPhaseName(elongation)).toBe(expected);
  });
});

describe("skyColorsAt", () => {
  it("returns the brightest stop at and above its altitude", () => {
    expect(skyColorsAt(10)).toEqual({ top: [63, 143, 224], bottom: [168, 214, 247] });
    expect(skyColorsAt(45)).toEqual({ top: [63, 143, 224], bottom: [168, 214, 247] });
  });

  it("returns the darkest stop at and below its altitude", () => {
    expect(skyColorsAt(-18)).toEqual({ top: [5, 8, 22], bottom: [13, 20, 48] });
    expect(skyColorsAt(-40)).toEqual({ top: [5, 8, 22], bottom: [13, 20, 48] });
  });

  it("interpolates evenly at the midpoint between two stops", () => {
    // Between the 0deg stop ([44,63,122]) and the -6deg stop ([26,37,80]).
    const { top } = skyColorsAt(-3);
    expect(top[0]).toBeCloseTo((44 + 26) / 2, 5);
    expect(top[1]).toBeCloseTo((63 + 37) / 2, 5);
    expect(top[2]).toBeCloseTo((122 + 80) / 2, 5);
  });
});

describe("rgbCss", () => {
  it("rounds channels into an rgb() string", () => {
    expect(rgbCss([1, 2, 3])).toBe("rgb(1,2,3)");
    expect(rgbCss([255, 0, 128.6])).toBe("rgb(255,0,129)");
  });
});

describe("compassDirection", () => {
  it.each([
    [0, "N"],
    [22, "N"],
    [23, "NE"],
    [45, "NE"],
    [90, "E"],
    [180, "S"],
    [270, "W"],
    [359, "N"],
    [-10, "N"],
    [400, "NE"],
  ])("maps azimuth %f to %s", (azimuth, expected) => {
    expect(compassDirection(azimuth)).toBe(expected);
  });
});

describe("litDiscPath", () => {
  it("returns a well-formed SVG arc path", () => {
    const path = litDiscPath(50, 50, 46, 90);
    expect(path).toMatch(/^M50 4A46 46 0 0 1 50 96A[\d.]+ 46 0 0 \d 50 4Z$/);
  });

  it("draws a full circle's worth of terminator radius at new and full moon", () => {
    // cos(0deg) and cos(180deg) are both +/-1, so the terminator ellipse widens to
    // the full radius at both new and full moon (the Moon looks like a full disc --
    // all dark or all lit -- not like a sliver).
    const newMoon = litDiscPath(0, 0, 10, 0);
    const fullMoon = litDiscPath(0, 0, 10, 180);
    expect(newMoon).toContain("A10.00 10");
    expect(fullMoon).toContain("A10.00 10");
  });

  it("flips the terminator sweep for a waning crescent", () => {
    // Waning (elongation > 180) and a crescent (elongation > 270): the one combination
    // not already hit by the new/first-quarter/full/last-quarter cases above.
    const path = litDiscPath(0, 0, 10, 320);
    expect(path).toMatch(/^M0 -10A10 10 0 0 0 0 10A[\d.]+ 10 0 0 1 0 -10Z$/);
  });
});
