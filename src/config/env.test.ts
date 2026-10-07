import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("menerima konfigurasi minimum Fase 1 dan mengisi default", () => {
    const env = parseServerEnv({ DATABASE_URL: "postgres://u:p@localhost:54322/uncle_dev" });
    expect(env.DATABASE_URL).toBe("postgres://u:p@localhost:54322/uncle_dev");
    expect(env.NODE_ENV).toBe("development");
    expect(env.PAYMENT_KEK_ACTIVE_ID).toBe("v1");
  });

  it("memperlakukan nilai kosong sebagai tidak diisi", () => {
    const env = parseServerEnv({
      DATABASE_URL: "postgres://localhost/uncle_dev",
      QR_SIGNING_KEY: "",
    });
    expect(env.QR_SIGNING_KEY).toBeUndefined();
  });

  it("menyebut nama variabel yang salah tanpa membocorkan nilainya", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://rahasia@host/db" })).toThrow(
      /DATABASE_URL/,
    );
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://rahasia@host/db" })).not.toThrow(
      /rahasia/,
    );
  });
});
