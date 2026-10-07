import { describe, expect, it } from "vitest";

import { parseInput, ValidationError } from "@/server/http/validation-error";

import { createCashOrderInputSchema, reissueExpiredOrderInputSchema } from "./schemas";

const ticketTypeId = "3f8c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const valid = {
  items: [{ ticketTypeId, quantity: 2 }],
  customer: { name: " Budi Santoso ", phone: "0812-3456-7890", email: "budi@mail.com" },
};

function errorsOf(input: unknown): Record<string, readonly string[]> {
  try {
    parseInput(createCashOrderInputSchema, input);
  } catch (error) {
    if (error instanceof ValidationError) return { ...error.errors };
    throw error;
  }
  return {};
}

describe("createCashOrderInputSchema (LP-07)", () => {
  it("AC-LP-07.1: data valid dinormalisasi", () => {
    const parsed = parseInput(createCashOrderInputSchema, valid);
    expect(parsed.customer).toEqual({
      name: "Budi Santoso",
      phone: "+6281234567890",
      email: "budi@mail.com",
    });
  });

  it("AC-LP-07.2: nama, no HP, email kosong → Wajib diisi / pesan field", () => {
    const errors = errorsOf({ ...valid, customer: { name: "", phone: "", email: "" } });
    expect(Object.keys(errors).sort()).toEqual([
      "customer.email",
      "customer.name",
      "customer.phone",
    ]);
    expect(errors["customer.phone"]).toContain("Wajib diisi");
  });

  it("AC-LP-07.3: no HP tidak valid", () => {
    expect(errorsOf({ ...valid, customer: { ...valid.customer, phone: "12345" } })).toEqual({
      "customer.phone": ["Format no HP tidak valid"],
    });
  });

  it("AC-LP-07.4: email tidak valid", () => {
    expect(errorsOf({ ...valid, customer: { ...valid.customer, email: "budi@" } })).toEqual({
      "customer.email": ["Format email tidak valid"],
    });
  });

  it("menolak jenis tiket ganda dan field tak dikenal", () => {
    expect(errorsOf({ ...valid, items: [valid.items[0], valid.items[0]] })["items"]).toBeDefined();
    expect(errorsOf({ ...valid, totalAmount: 1 })["_"]).toBeDefined();
  });
});

describe("reissueExpiredOrderInputSchema", () => {
  it("wajib cashReceived = true", () => {
    expect(() =>
      parseInput(reissueExpiredOrderInputSchema, {
        orderId: ticketTypeId,
        cashReceived: false,
        expectedTotal: 150_000,
      }),
    ).toThrow(ValidationError);
  });
});
