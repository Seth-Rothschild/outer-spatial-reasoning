import { describe, expect, it } from "vitest";
import { bostonTimeToUnixMs, unixMsToDatetimeInput } from "../src/ui.js";

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
    // branch that re-checks the offset after the first guess.
    const unixMs = bostonTimeToUnixMs(2024, 3, 10, 2, 30);
    expect(Number.isFinite(unixMs)).toBe(true);
  });

  it("resolves the fall-back ambiguous hour (clocks repeat 1:00-2:00 AM)", () => {
    const unixMs = bostonTimeToUnixMs(2024, 11, 3, 1, 30);
    expect(Number.isFinite(unixMs)).toBe(true);
  });
});
