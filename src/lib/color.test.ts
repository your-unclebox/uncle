import { describe, expect, it } from "vitest";

import { contrastRatio } from "./color";

describe("contrastRatio", () => {
  it("hitam vs putih 21:1, sama warna 1:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#2563EB", "#2563EB")).toBeCloseTo(1, 5);
  });

  it("primary Uncle #2563EB lolos AA untuk teks putih", () => {
    expect(contrastRatio("#FFFFFF", "#2563EB")).toBeGreaterThan(4.5);
  });
});
