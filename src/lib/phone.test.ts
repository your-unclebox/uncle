import { describe, expect, it } from "vitest";

import { normalizeIndonesianPhone } from "./phone";

describe("normalizeIndonesianPhone (BR-TRX-02)", () => {
  it.each([
    ["081234567890", "+6281234567890"],
    ["+6281234567890", "+6281234567890"],
    ["6281234567890", "+6281234567890"],
    ["0812-3456-7890", "+6281234567890"],
    ["0812 3456 789", "+628123456789"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeIndonesianPhone(input)).toBe(expected);
  });

  it.each(["12345", "0812345", "021234567890", "08123456789012345", "+6512345678", "08abc4567890"])(
    "menolak %s",
    (input) => {
      expect(normalizeIndonesianPhone(input)).toBeNull();
    },
  );
});
