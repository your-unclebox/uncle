import { describe, expect, it } from "vitest";

import { OrderNotFoundError } from "@/server/modules/ordering/errors";

import { TicketResendNotAllowedError } from "./errors";
import { assertTicketResendable } from "./resend-ticket";

// ADM-08: syarat Kirim Ulang QR Tiket.
describe("assertTicketResendable", () => {
  it("order tidak ada → 404 ORDER_NOT_FOUND", () => {
    expect(() => assertTicketResendable(undefined)).toThrow(OrderNotFoundError);
  });

  it.each(["RESERVED", "PENDING_PAYMENT", "EXPIRED", "CANCELLED", "REFUNDED"] as const)(
    "status %s (belum/tidak Lunas) → 400 ORDER_NOT_PAID",
    (status) => {
      expect.assertions(3);
      try {
        assertTicketResendable({ status, customerEmail: "siti@example.com" });
      } catch (error) {
        expect(error).toBeInstanceOf(TicketResendNotAllowedError);
        expect((error as TicketResendNotAllowedError).status).toBe(400);
        expect((error as TicketResendNotAllowedError).reason).toBe("ORDER_NOT_PAID");
      }
    },
  );

  it("email kosong → 400 EMAIL_MISSING", () => {
    expect(() => assertTicketResendable({ status: "PAID", customerEmail: "  " })).toThrow(
      expect.objectContaining({ reason: "EMAIL_MISSING" }),
    );
  });

  it("Lunas + email ada → lolos", () => {
    expect(() =>
      assertTicketResendable({ status: "PAID", customerEmail: "siti@example.com" }),
    ).not.toThrow();
  });
});
