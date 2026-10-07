import { describe, expect, it } from "vitest";

import { toLocalDateKey } from "./datetime";

describe("toLocalDateKey", () => {
  it("memakai tanggal di zona waktu event, bukan UTC", () => {
    // 20 Des 2026 23:30 WIB = 20 Des 16:30 UTC; 21 Des 00:30 WIB = 20 Des 17:30 UTC.
    expect(toLocalDateKey(new Date("2026-12-20T16:30:00Z"), "Asia/Jakarta")).toBe("2026-12-20");
    expect(toLocalDateKey(new Date("2026-12-20T17:30:00Z"), "Asia/Jakarta")).toBe("2026-12-21");
  });
});
