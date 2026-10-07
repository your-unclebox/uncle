import { describe, expect, it } from "vitest";

import { maskPhone, normalizeIndonesianPhone, phoneSearchDigits, toNationalPhone } from "./phone";

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

describe("maskPhone", () => {
  it("menyamarkan bagian tengah no HP", () => {
    expect(maskPhone("+6281234567890")).toBe("0812****7890");
    expect(maskPhone("0812")).toBe("0812");
  });
});

describe("no HP untuk admin (ADM-04/05)", () => {
  it("menampilkan bentuk nasional", () => {
    expect(toNationalPhone("+6281234567890")).toBe("081234567890");
  });

  it.each([
    ["0812", "812"],
    ["62812", "812"],
    ["+62 812-34", "81234"],
    ["7890", "7890"],
  ])("cari %s → %s", (query, expected) => {
    expect(phoneSearchDigits(query)).toBe(expected);
  });

  it.each(["siti", "08", "UNC-7K3P", ""])("bukan pencarian no HP: %s", (query) => {
    expect(phoneSearchDigits(query)).toBeNull();
  });
});
