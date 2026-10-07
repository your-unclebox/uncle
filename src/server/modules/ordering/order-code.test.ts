import { describe, expect, it } from "vitest";

import { generateOrderCode } from "./order-code";

describe("generateOrderCode", () => {
  it("format UNC- + 6 karakter Crockford Base32 (tanpa I, L, O, U)", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateOrderCode()).toMatch(/^UNC-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
    }
  });

  it("acak", () => {
    const codes = new Set(Array.from({ length: 500 }, generateOrderCode));
    expect(codes.size).toBeGreaterThan(495);
  });
});
