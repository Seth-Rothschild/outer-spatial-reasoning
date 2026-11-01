import { describe, expect, it } from "vitest";
import {
  bostonTimeToUnixMs,
  unixMsToDatetimeInput,
  formatFullDate,
  litDiscPath,
  moonPhaseName,
} from "../src/ui.js";

describe("Boston local time conversions", () => {
  it("accounts for EST (UTC-5) in winter", () => {
    expect(bostonTimeToUnixMs(2024, 1, 1, 0, 0)).toBe(Date.UTC(2024, 0, 1, 5, 0));
  });

  it("accounts for EDT (UTC-4) in summer", () => {
    expect(bostonTimeToUnixMs(2024, 7, 4, 12, 0)).toBe(Date.UTC(2024, 6, 4, 16, 0));
  });

  it("round-trips through unixMsToDatetimeInput", () => {
    const unixMs = bostonTimeToUnixMs(2024, 3, 15, 9, 45);
    expect(unixMsToDatetimeInput(unixMs)).toBe("2024-03-15T09:45");
  });

  it("resolves the spring-forward gap (clocks skip 2:00-3:00 AM)", () => {
    // 2024-03-10 02:30 never happened in Boston; this exercises the correction
    // branch that re-checks the offset after the first guess. It resolves to
    // 06:30 UTC -- a 4-hour (EDT) offset, the one that guessing 02:30 as EST and
    // re-checking actually lands on.
    expect(bostonTimeToUnixMs(2024, 3, 10, 2, 30)).toBe(Date.UTC(2024, 2, 10, 6, 30));
  });

  it("resolves the fall-back ambiguous hour (clocks repeat 1:00-2:00 AM)", () => {
    // 01:30 happens twice on 2024-11-03; this resolves to its first (EDT) occurrence,
    // 05:30 UTC, rather than the second (EST) one an hour later.
    expect(bostonTimeToUnixMs(2024, 11, 3, 1, 30)).toBe(Date.UTC(2024, 10, 3, 5, 30));
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
    expect(litDiscPath(0, 0, 10, 0)).toBe("M0 -10A10 10 0 0 1 0 10A10.00 10 0 0 0 0 -10Z");
    expect(litDiscPath(0, 0, 10, 180)).toBe("M0 -10A10 10 0 0 0 0 10A10.00 10 0 0 0 0 -10Z");
  });

  it("matches a known terminator radius at a non-axis-aligned elongation", () => {
    // 60 degrees isn't one of the special angles (0/90/180/270) covered elsewhere,
    // so this pins the terminator-radius formula's coefficient and its conversion to
    // radians, not just its behavior at degenerate inputs.
    expect(litDiscPath(0, 0, 10, 60)).toBe("M0 -10A10 10 0 0 1 0 10A5.00 10 0 0 0 0 -10Z");
  });

  it("flips the terminator sweep for a waning crescent", () => {
    // Waning (elongation > 180) and a crescent (elongation > 270): the one combination
    // not already hit by the new/first-quarter/full/last-quarter cases above.
    expect(litDiscPath(0, 0, 10, 320)).toBe("M0 -10A10 10 0 0 0 0 10A7.66 10 0 0 1 0 -10Z");
  });

  it("flips isCrescent exactly at the 90-degree boundary, not before or after", () => {
    expect(litDiscPath(0, 0, 10, 89)).toBe("M0 -10A10 10 0 0 1 0 10A0.17 10 0 0 0 0 -10Z");
    expect(litDiscPath(0, 0, 10, 90)).toBe("M0 -10A10 10 0 0 1 0 10A0.00 10 0 0 1 0 -10Z");
    expect(litDiscPath(0, 0, 10, 91)).toBe("M0 -10A10 10 0 0 1 0 10A0.17 10 0 0 1 0 -10Z");
  });

  it("flips isCrescent exactly at the 270-degree boundary, not before or after", () => {
    expect(litDiscPath(0, 0, 10, 269)).toBe("M0 -10A10 10 0 0 0 0 10A0.17 10 0 0 0 0 -10Z");
    expect(litDiscPath(0, 0, 10, 270)).toBe("M0 -10A10 10 0 0 0 0 10A0.00 10 0 0 0 0 -10Z");
    expect(litDiscPath(0, 0, 10, 271)).toBe("M0 -10A10 10 0 0 0 0 10A0.17 10 0 0 1 0 -10Z");
  });
});

describe("formatFullDate", () => {
  it("formats a known Boston time with weekday, date, time, and zone", () => {
    const unixMs = bostonTimeToUnixMs(2024, 3, 15, 9, 45);
    expect(formatFullDate.format(unixMs)).toBe("Fri, Mar 15, 2024, 9:45:00 AM EDT");
  });
});

describe("moonPhaseName", () => {
  it("names the four primary phases at their exact elongation", () => {
    expect(moonPhaseName(0)).toBe("New Moon");
    expect(moonPhaseName(90)).toBe("First Quarter");
    expect(moonPhaseName(180)).toBe("Full Moon");
    expect(moonPhaseName(270)).toBe("Last Quarter");
  });

  it("names the in-between phases", () => {
    expect(moonPhaseName(45)).toBe("Waxing Crescent");
    expect(moonPhaseName(135)).toBe("Waxing Gibbous");
    expect(moonPhaseName(225)).toBe("Waning Gibbous");
    expect(moonPhaseName(315)).toBe("Waning Crescent");
  });

  it("wraps New Moon's range across the 360/0 boundary", () => {
    expect(moonPhaseName(359)).toBe("New Moon");
    expect(moonPhaseName(1)).toBe("New Moon");
  });
});
