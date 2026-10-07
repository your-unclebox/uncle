import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auditLogs, paymentConfigs } from "@/server/db/schema";
import {
  decryptCredentials,
  isQrisConnected,
  retestPaymentConfig,
  savePaymentConfig,
} from "@/server/modules/payments";
import { withTenant } from "@/server/tenancy";

import { createEvent, useTestDatabase } from "../../fixtures/db";
import { APP_URL, connectQris, fakeTripay, kek, TRIPAY_CREDENTIALS } from "../../fixtures/payments";

describe("Payment Settings (ADM-07, DRD Security §1)", () => {
  const db = useTestDatabase();
  const deps = (provider: ReturnType<typeof fakeTripay>["provider"]) => ({
    provider,
    kek,
    mode: "SANDBOX" as const,
    appUrl: APP_URL,
  });

  it("kredensial valid → Terhubung; tampilan termasking; DB hanya menyimpan ciphertext", async () => {
    const event = await createEvent(db);
    const { provider } = fakeTripay();
    const view = await connectQris(db, event.id, provider);
    expect(view).toMatchObject({
      status: "CONNECTED",
      provider: "TRIPAY",
      mode: "SANDBOX",
      merchantCodeLast4: "0001",
      apiKeyLast4: "1234",
      lastError: null,
    });
    expect(view.webhookUrl).toMatch(
      /^https:\/\/app\.uncle\.test\/api\/webhooks\/payments\/tripay\/[A-Za-z0-9_-]{43}$/,
    );
    expect(JSON.stringify(view)).not.toContain(TRIPAY_CREDENTIALS.apiKey);
    expect(JSON.stringify(view)).not.toContain(TRIPAY_CREDENTIALS.privateKey);

    const [row] = await db
      .select()
      .from(paymentConfigs)
      .where(eq(paymentConfigs.eventId, event.id));
    if (!row) throw new Error("config hilang");
    expect(row.apiKeyEnc?.toString("utf8")).not.toContain(TRIPAY_CREDENTIALS.apiKey);
    expect(row.privateKeyEnc?.toString("utf8")).not.toContain(TRIPAY_CREDENTIALS.privateKey);
    expect(decryptCredentials(row, kek)).toEqual({ mode: "SANDBOX", ...TRIPAY_CREDENTIALS });
    expect(await withTenant(db, { eventId: event.id }, isQrisConnected)).toBe(true);

    // Ciphertext terikat ke tenant (AAD): dipindah ke event lain → gagal didekripsi.
    expect(() => decryptCredentials({ ...row, eventId: crypto.randomUUID() }, kek)).toThrow();

    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, row.id));
    expect(audit).toMatchObject({ action: "PAYMENT_CONFIG_UPDATED" });
    expect(JSON.stringify(audit)).not.toContain(TRIPAY_CREDENTIALS.apiKey);
  });

  it("ditolak provider → Gagal terhubung + alasan; QRIS tidak tersedia (AC-ADM-07.2)", async () => {
    const event = await createEvent(db);
    const { provider, state } = fakeTripay();
    state.rejectApiKey = true;
    const view = await connectQris(db, event.id, provider);
    expect(view).toMatchObject({ status: "FAILED", lastError: "Invalid API Key" });
    expect(await withTenant(db, { eventId: event.id }, isQrisConnected)).toBe(false);

    // Uji Ulang setelah masalah di sisi provider beres.
    state.rejectApiKey = false;
    const retested = await retestPaymentConfig(db, { eventId: event.id }, deps(provider));
    expect(retested).toMatchObject({ status: "CONNECTED", lastError: null });

    state.channelActive = false;
    const inactive = await retestPaymentConfig(db, { eventId: event.id }, deps(provider));
    expect(inactive).toMatchObject({
      status: "FAILED",
      lastError: "Channel QRIS belum aktif di akun Tripay.",
    });
  });

  it("field kosong → VALIDATION_ERROR per field; Ganti Kredensial menimpa (AC-ADM-07.3)", async () => {
    const event = await createEvent(db);
    const { provider } = fakeTripay();
    await expect(
      savePaymentConfig(
        db,
        { eventId: event.id },
        { merchantCode: "", apiKey: " ", privateKey: "x" },
        deps(provider),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      errors: { merchantCode: ["Wajib diisi"], apiKey: ["Wajib diisi"] },
    });

    const first = await connectQris(db, event.id, provider);
    const second = await savePaymentConfig(
      db,
      { eventId: event.id },
      { ...TRIPAY_CREDENTIALS, apiKey: "DEV-baru-9876" },
      deps(provider),
    );
    expect(second.apiKeyLast4).toBe("9876");
    // URL webhook tetap (tidak perlu didaftarkan ulang di gateway).
    expect(second.webhookUrl).toBe(first.webhookUrl);
    const rows = await db.select().from(paymentConfigs).where(eq(paymentConfigs.eventId, event.id));
    expect(rows).toHaveLength(1);
  });

  it("uji ulang tanpa kredensial → PAYMENT_CONFIG_NOT_SET", async () => {
    const event = await createEvent(db);
    const { provider } = fakeTripay();
    await expect(
      retestPaymentConfig(db, { eventId: event.id }, deps(provider)),
    ).rejects.toMatchObject({ code: "PAYMENT_CONFIG_NOT_SET" });
  });
});
