import { createHmac, randomInt, randomUUID } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

// Alur QRIS end-to-end (ADM-07, LP-08/09/10): admin mengatur kredensial Tripay
// di Payment Settings → pembeli memilih QRIS → QR pembayaran + countdown →
// webhook Tripay bertanda tangan → Lunas → QR Tiket. Gateway = Tripay tiruan
// (tests/support/mock-tripay.ts), bukan sandbox Tripay sungguhan.
const PORT = 3100;
const MOCK_TRIPAY = "http://127.0.0.1:3199";
const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "e2e-password-123";
const PRIVATE_KEY = "pk-e2e-private-key";

const sql = () =>
  postgres(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54322/uncle_dev", {
    max: 1,
    onnotice: () => {},
  });

async function createEventWithAdmin() {
  const db = sql();
  const slug = `e2e-qris-${randomUUID().slice(0, 8)}`;
  const day = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  const [event] = await db<{ id: string }[]>`
    insert into events (slug, status, name, starts_at, ends_at, venue_name, published_at)
    values (${slug}, 'ACTIVE', 'Konser QRIS E2E', ${`${day}T19:00:00+07:00`},
            ${`${day}T22:00:00+07:00`}, 'Gedung Kesenian', now())
    returning id`;
  await db`insert into ticket_types (event_id, name, price, quota)
           values (${event!.id}, 'Reguler', 75000, 100)`;
  const email = `admin-e2e-${randomUUID().slice(0, 8)}@uncle.local`;
  const [user] = await db<{ id: string }[]>`
    insert into users (email, name, password_hash)
    values (${email}, 'Admin E2E', ${await hash(PASSWORD, { algorithm: 2 })})
    returning id`;
  await db`insert into memberships (user_id, role_id, event_id) values (${user!.id}, 2, ${event!.id})`;
  await db.end();
  return { slug, eventId: event!.id, email };
}

async function webhookKeyOf(eventId: string): Promise<string> {
  const db = sql();
  const [row] = await db<{ webhook_key: string }[]>`
    select webhook_key from payment_configs where event_id = ${eventId}`;
  await db.end();
  return row!.webhook_key;
}

test("Admin menghubungkan QRIS, pembeli membayar QRIS sampai QR Tiket terbit", async ({
  page,
  browser,
  request,
}, info) => {
  const { slug, eventId, email } = await createEventWithAdmin();

  // --- Admin: Payment Settings (ADM-07) ---
  await page.goto(`http://localhost:${PORT}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL(/\/admin\//);
  await page.goto(`http://localhost:${PORT}/admin/events/${eventId}/payment-settings`);
  await expect(page.getByTestId("connection-status")).toContainText("Belum diatur");
  await page.getByRole("button", { name: "Simpan & Uji Koneksi" }).click();
  await expect(page.getByText("Wajib diisi")).toHaveCount(3);
  await page.getByLabel("Merchant Code").fill("T0001");
  await page.getByLabel("API Key").fill("DEV-e2e-api-key-1234");
  await page.getByLabel("Private Key").fill(PRIVATE_KEY);
  await page.getByRole("button", { name: "Simpan & Uji Koneksi" }).click();
  await expect(page.getByTestId("connection-status")).toContainText("Terhubung");
  await expect(page.getByText("●●●●●●●●●●1234")).toBeVisible();
  await expect(page.getByText(PRIVATE_KEY)).toHaveCount(0);
  await page.screenshot({ path: `test-results/payment-settings-${info.project.name}.png` });

  // --- Pembeli: checkout QRIS (konteks browser terpisah, tanpa sesi admin) ---
  const buyer = await browser.newPage({ viewport: page.viewportSize() });
  await buyer.goto(`http://${slug}.uncle.localhost:${PORT}/`);
  await buyer.getByRole("button", { name: "Tambah Reguler" }).click();
  await buyer
    .getByRole("button", { name: /Lanjut Isi Data Diri/ })
    .filter({ visible: true })
    .first()
    .click();
  await buyer.getByLabel("Nama lengkap").fill("Budi Santoso");
  await buyer.getByLabel("No. HP (WhatsApp)").fill(`0812${randomInt(10_000_000, 99_999_999)}`);
  await buyer.getByLabel("Email").fill("budi@mail.com");
  await buyer.getByRole("button", { name: "Lanjut →" }).click();

  // LP-08: QRIS tersedia & terpilih (client terhubung); langkah 3 dari 5.
  await expect(buyer.getByText("Langkah 3 dari 5")).toBeVisible();
  await expect(buyer.getByRole("radio", { name: /QRIS/ })).toBeChecked();
  await buyer.getByRole("button", { name: "Bayar Sekarang →" }).click();

  // LP-09: QR pembayaran + nominal + countdown + menunggu.
  await expect(buyer.getByText("Scan untuk membayar")).toBeVisible();
  await expect(buyer.getByRole("img", { name: "QR Pembayaran" })).toBeVisible();
  await expect(buyer.getByTestId("payment-countdown")).toContainText(/Bayar dalam 1[45]:\d\d/);
  await expect(buyer.getByText("Menunggu pembayaran…")).toBeVisible();
  const orderCode = (await buyer.getByTestId("order-code").first().textContent()) ?? "";
  await buyer.screenshot({ path: `test-results/qris-pay-${info.project.name}.png` });

  // Tripay mengirim callback "PAID" bertanda tangan ke URL webhook tenant.
  const created = await request.get(
    `${MOCK_TRIPAY}/__control/transaction?merchant_ref=${orderCode}-1`,
  );
  const transaction = (await created.json()) as { reference: string; amount: number };
  const rawBody = JSON.stringify({
    reference: transaction.reference,
    merchant_ref: `${orderCode}-1`,
    payment_method: "QRIS",
    total_amount: transaction.amount,
    fee_customer: 0,
    status: "PAID",
    paid_at: Math.floor(Date.now() / 1000),
  });
  const callback = await request.post(
    `http://localhost:${PORT}/api/webhooks/payments/tripay/${await webhookKeyOf(eventId)}`,
    {
      headers: {
        "content-type": "application/json",
        "x-callback-event": "payment_status",
        "x-callback-signature": createHmac("sha256", PRIVATE_KEY).update(rawBody).digest("hex"),
      },
      data: rawBody,
    },
  );
  expect(await callback.json()).toEqual({ success: true });

  // AC-LP-09.2: halaman otomatis lanjut → Step 5 dengan QR Tiket & Lunas.
  await expect(buyer.getByText("✅ Pembayaran berhasil!")).toBeVisible({ timeout: 10_000 });
  await expect(buyer.getByRole("img", { name: "QR Tiket" })).toBeVisible({ timeout: 10_000 });
  await expect(buyer.getByText("✔ Lunas")).toBeVisible();
  await expect(buyer.getByText(/Budi Santoso · 0812\*\*\*\*/)).toBeVisible();
  await buyer.screenshot({ path: `test-results/qris-paid-${info.project.name}.png` });
  await buyer.close();
});
