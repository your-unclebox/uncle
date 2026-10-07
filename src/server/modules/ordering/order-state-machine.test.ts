import { describe, expect, it } from "vitest";

import { InvalidOrderTransitionError } from "./errors";
import {
  assertTransition,
  canTransition,
  initialOrderStatus,
  type OrderStatus,
} from "./order-state-machine";

const STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "RESERVED",
  "PAID",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
];

describe("state machine order (DRD §Database 4.1)", () => {
  it("status awal: QRIS PENDING_PAYMENT, Cash RESERVED, reissue PAID", () => {
    expect(initialOrderStatus("QRIS")).toBe("PENDING_PAYMENT");
    expect(initialOrderStatus("CASH")).toBe("RESERVED");
    expect(initialOrderStatus("CASH", { reissue: true })).toBe("PAID");
    expect(() => initialOrderStatus("QRIS", { reissue: true })).toThrow(
      InvalidOrderTransitionError,
    );
  });

  it.each([
    ["QRIS", "PENDING_PAYMENT", "PAID"],
    ["QRIS", "PENDING_PAYMENT", "EXPIRED"],
    ["QRIS", "EXPIRED", "PAID"],
    ["QRIS", "PAID", "CANCELLED"],
    ["QRIS", "PAID", "REFUNDED"],
    ["CASH", "RESERVED", "PAID"],
    ["CASH", "RESERVED", "EXPIRED"],
    ["CASH", "RESERVED", "CANCELLED"],
    ["CASH", "PAID", "CANCELLED"],
    ["CASH", "PAID", "REFUNDED"],
  ] as const)("%s: %s → %s diizinkan", (method, from, to) => {
    expect(canTransition(method, from, to)).toBe(true);
    expect(() => assertTransition(method, from, to)).not.toThrow();
  });

  it("tepat 10 transisi yang diizinkan; sisanya ditolak", () => {
    let allowed = 0;
    for (const method of ["QRIS", "CASH"] as const) {
      for (const from of STATUSES) {
        for (const to of STATUSES) if (canTransition(method, from, to)) allowed += 1;
      }
    }
    expect(allowed).toBe(10);
  });

  it.each([
    ["CASH", "EXPIRED", "PAID"],
    ["CASH", "EXPIRED", "RESERVED"],
    ["QRIS", "PENDING_PAYMENT", "RESERVED"],
    ["CASH", "CANCELLED", "PAID"],
    ["QRIS", "REFUNDED", "PAID"],
  ] as const)("%s: %s → %s ditolak", (method, from, to) => {
    expect(() => assertTransition(method, from, to)).toThrow(InvalidOrderTransitionError);
  });
});
