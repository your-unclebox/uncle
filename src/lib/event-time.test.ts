import { describe, expect, it } from "vitest";

import { formatTimeRange, toInstant, toLocalParts } from "./event-time";

describe("event-time (WIB)", () => {
  it("tanggal + jam WIB → instant UTC dan kembali", () => {
    const instant = toInstant("2026-12-20", "19:00", "Asia/Jakarta");
    expect(instant.toISOString()).toBe("2026-12-20T12:00:00.000Z");
    expect(toLocalParts(instant, "Asia/Jakarta")).toEqual({ date: "2026-12-20", time: "19:00" });
  });

  it("format rentang HH:MM–HH:MM WIB", () => {
    expect(
      formatTimeRange(
        toInstant("2026-12-20", "19:00", "Asia/Jakarta"),
        toInstant("2026-12-20", "22:00", "Asia/Jakarta"),
        "Asia/Jakarta",
      ),
    ).toBe("19:00–22:00 WIB");
  });

  it("zona waktu lain belum didukung", () => {
    expect(() => toInstant("2026-12-20", "19:00", "Asia/Makassar")).toThrow();
  });
});
