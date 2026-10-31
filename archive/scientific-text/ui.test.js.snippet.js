// Extracted from tests/ui.test.js. Covered formatInteger -- see ui.js.snippet.js
// in this directory.

import { describe, expect, it } from "vitest";

describe("formatInteger", () => {
  it("rounds and adds thousands separators", () => {
    expect(formatInteger(0)).toBe("0");
    expect(formatInteger(1234.5)).toBe("1,235");
    expect(formatInteger(1234567.8)).toBe("1,234,568");
    expect(formatInteger(-5)).toBe("-5");
  });
});
