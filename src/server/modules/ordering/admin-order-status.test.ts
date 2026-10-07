import { describe, expect, it } from "vitest";

import { ValidationError } from "@/server/http/validation-error";

import {
  decodeOrderCursor,
  effectiveOrderStatus,
  encodeOrderCursor,
  phoneSearchDigits,
  pickupStatus,
} from "./admin-order-status";

const NOW = new Date("2026-12-20T20:00:00+07:00");
const BEFORE = new Date("2026-12-20T19:00:00+07:00");
const AFTER = new Date("2026-12-20T22:00:00+07:00");

describe("effectiveOrderStatus", () => {
  it("hold yang lewat batas tapi belum disapu cron tampil Kedaluwarsa", () => {
    expect(effectiveOrderStatus({ status: "RESERVED", expiresAt: BEFORE }, NOW)).toBe("EXPIRED");
    expect(effectiveOrderStatus({ status: "PENDING_PAYMENT", expiresAt: BEFORE }, NOW)).toBe(
      "EXPIRED",
    );
  });

  it("hold yang masih berlaku dan status final tidak berubah", () => {
    expect(effectiveOrderStatus({ status: "RESERVED", expiresAt: AFTER }, NOW)).toBe("RESERVED");
    expect(effectiveOrderStatus({ status: "PAID", expiresAt: BEFORE }, NOW)).toBe("PAID");
    expect(effectiveOrderStatus({ status: "CANCELLED", expiresAt: null }, NOW)).toBe("CANCELLED");
  });
});

describe("pickupStatus", () => {
  it("CHECKED_IN = Diambil", () => {
    expect(pickupStatus("CHECKED_IN", "PAID")).toBe("DONE");
  });

  it("QR aktif di order Lunas / reservasi berlaku = Belum diambil", () => {
    expect(pickupStatus("ISSUED", "PAID")).toBe("PENDING");
    expect(pickupStatus("ISSUED", "RESERVED")).toBe("PENDING");
  });

  it("tanpa QR aktif tidak punya status ambil", () => {
    expect(pickupStatus(null, "PENDING_PAYMENT")).toBeNull();
    expect(pickupStatus("VOID", "EXPIRED")).toBeNull();
    expect(pickupStatus("ISSUED", "EXPIRED")).toBeNull();
  });
});

describe("phoneSearchDigits", () => {
  it("awalan 0 diubah ke 62 agar cocok dengan E.164", () => {
    expect(phoneSearchDigits("0812 3456")).toBe("628123456");
    expect(phoneSearchDigits("+62 812")).toBe("62812");
    expect(phoneSearchDigits("7890")).toBe("7890");
  });

  it("bukan pencarian no HP bila terlalu pendek atau mengandung huruf", () => {
    expect(phoneSearchDigits("08")).toBeNull();
    expect(phoneSearchDigits("UNC-123")).toBeNull();
    expect(phoneSearchDigits("siti")).toBeNull();
  });
});

describe("cursor paginasi", () => {
  const cursor = {
    createdAt: "2026-12-01T03:00:00.123456Z",
    id: "3f8c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
  };

  it("encode → decode bolak-balik", () => {
    expect(decodeOrderCursor(encodeOrderCursor(cursor))).toEqual(cursor);
  });

  it.each([
    "bukan-base64",
    Buffer.from("[]").toString("base64url"),
    Buffer.from(JSON.stringify(["2026-12-01", cursor.id])).toString("base64url"),
    Buffer.from(JSON.stringify([cursor.createdAt, "x"])).toString("base64url"),
  ])("cursor rusak → VALIDATION_ERROR: %s", (raw) => {
    expect(() => decodeOrderCursor(raw)).toThrow(ValidationError);
  });
});
