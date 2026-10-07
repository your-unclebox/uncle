import { describe, expect, it } from "vitest";

import { computeOrderTotal } from "./pricing";

describe("computeOrderTotal (BR-TRX-04)", () => {
  it("AC-LP-06.1: 2 Reguler + 1 VIP = Rp 300.000", () => {
    expect(
      computeOrderTotal([
        { unitPrice: 75_000n, quantity: 2 },
        { unitPrice: 150_000n, quantity: 1 },
      ]),
    ).toBe(300_000n);
  });

  it("tetap tepat untuk nominal besar (bigint, tanpa float)", () => {
    expect(computeOrderTotal([{ unitPrice: 9_007_199_254_740_993n, quantity: 3 }])).toBe(
      27_021_597_764_222_979n,
    );
  });

  it("kosong → 0", () => {
    expect(computeOrderTotal([])).toBe(0n);
  });
});
