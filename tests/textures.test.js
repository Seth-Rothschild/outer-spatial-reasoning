import { describe, expect, it } from "vitest";
import {
  hash,
  smoothstep,
  lerp,
  noise3,
  fractalNoise,
  clamp01,
  mixColor,
  blurMask,
} from "../src/textures.js";

describe("hash", () => {
  it("is deterministic and stays within [0, 1)", () => {
    expect(hash(1, 2, 3)).toBe(hash(1, 2, 3));
    for (const coords of [
      [0, 0, 0],
      [-5, 10, 100],
      [999, -999, 1],
    ]) {
      const value = hash(...coords);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("gives different inputs different values (no trivial collisions)", () => {
    expect(hash(1, 2, 3)).not.toBe(hash(3, 2, 1));
  });
});

describe("smoothstep", () => {
  it("passes through its endpoints and midpoint", () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 9);
  });
});

describe("lerp", () => {
  it("interpolates linearly", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(10, 20, 2)).toBe(30); // extrapolates past t=1
  });
});

describe("noise3", () => {
  it("is deterministic and stays within [0, 1)", () => {
    const value = noise3(1.5, 2.5, 3.5);
    expect(noise3(1.5, 2.5, 3.5)).toBe(value);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  it("is continuous at integer lattice points (matches the raw hash there)", () => {
    expect(noise3(2, 3, 4)).toBeCloseTo(hash(2, 3, 4), 9);
  });
});

describe("fractalNoise", () => {
  it("stays within [0, 1) regardless of octave count", () => {
    for (const octaves of [1, 3, 6]) {
      const value = fractalNoise(0.3, 0.6, 0.9, octaves);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("clamp01", () => {
  it("clamps to the unit interval", () => {
    expect(clamp01(-5)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(5)).toBe(1);
  });
});

describe("mixColor", () => {
  it("interpolates each channel independently", () => {
    expect(mixColor([0, 0, 0], [100, 200, 300], 0.5)).toEqual([50, 100, 150]);
    expect(mixColor([10, 20, 30], [10, 20, 30], 0.7)).toEqual([10, 20, 30]);
  });
});

describe("blurMask", () => {
  it("thresholds raw pixel values before blurring", () => {
    // A solid block of fully-lit pixels (255) should blur to a flat plateau of 1s
    // in its interior, since every sample in the blur radius is also inside the block.
    const width = 10,
      height = 10,
      radius = 1;
    const rawMask = new Uint8Array(width * height).fill(255);
    const blurred = blurMask(rawMask, width, height, radius);
    expect(blurred[5 * width + 5]).toBeCloseTo(1, 9);
  });

  it("treats sub-threshold pixels as unlit", () => {
    const width = 6,
      height = 6;
    const rawMask = new Uint8Array(width * height).fill(100); // below the 127 threshold
    const blurred = blurMask(rawMask, width, height, 1);
    expect(blurred.every((v) => v === 0)).toBe(true);
  });

  it("wraps horizontally so coastlines don't seam at +/-180 degrees", () => {
    const width = 8,
      height = 4,
      radius = 1;
    const rawMask = new Uint8Array(width * height);
    rawMask[0] = 255; // lit pixel at the left edge of a row
    const blurred = blurMask(rawMask, width, height, radius);
    // Its blur should wrap into the last column of the same row.
    expect(blurred[width - 1]).toBeGreaterThan(0);
  });
});
