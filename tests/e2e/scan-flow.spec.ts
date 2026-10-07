import { randomBytes, randomUUID } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

// Scan Tiket (SCN-01..08, AI-CODING-RULES Testing §1 E2E): Cash belum bayar →
// Konfirmasi Lunas → Tandai Diambil; reservasi kedaluwarsa → Buat Pesanan Baru.
// Browser headless tanpa kamera → state (h) + Input Kode Manual (SCN-06).
const PORT = 3100;
const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "e2e-password-123";

const sql = () =>
  postgres(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54322/uncle_dev", {
    max: 1,
    onnotice: () => {},
  });

async function seed() {
  const db = sql();
  const slug = `e2e-scan-${randomUUID().slice(0, 8)}`;
  const day = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  const endsAt = `${day}T22:00:00+07:00`;
  const [event] = await db<{ id: string }[]>`
    insert into events (slug, status, name, starts_at, ends_at, venue_name, published_at)
    values (${slug}, 'ACTIVE', 'Teater Scan E2E', ${`${day}T19:00:00+07:00`},
            ${endsAt}, 'Gedung Kesenian', now())
    returning id`;
  const eventId = event!.id;
  // allocated_count = Siti 1 + reservasi kedaluwarsa Eko 1 (belum disapu cron).
  const [vip] = await db<{ id: string }[]>`
    insert into ticket_types (event_id, name, price, quota, allocated_count)
    values (${eventId}, 'VIP', 150000, 50, 2) returning id`;
  const email = `scan-e2e-${randomUUID().slice(0, 8)}@uncle.local`;
  const [user] = await db<{ id: string }[]>`
    insert into users (email, name, password_hash)
    values (${email}, 'Rina Scanner', ${await hash(PASSWORD, { algorithm: 2 })})
    returning id`;
  await db`insert into memberships (user_id, role_id, event_id) values (${user!.id}, 2, ${eventId})`;

  const reservation = async (name: string, expiresAt: string) => {
    const code = `UNC-${randomBytes(3).toString("hex").toUpperCase()}`;
    const [order] = await db<{ id: string }[]>`
      insert into orders (event_id, order_code, customer_name, customer_phone, customer_email,
                          payment_method, status, total_amount, expires_at, created_at)
      values (${eventId}, ${code}, ${name}, '+6281311221122', 'pembeli@mail.com',
              'CASH', 'RESERVED', 150000, ${expiresAt}, now() - interval '2 hours')
      returning id`;
    await db`insert into order_items (event_id, order_id, ticket_type_id, quantity, unit_price, ticket_type_name)
             values (${eventId}, ${order!.id}, ${vip!.id}, 1, 150000, 'VIP')`;
    await db`insert into tickets (event_id, order_id, qr_fingerprint)
             values (${eventId}, ${order!.id}, ${randomBytes(32)})`;
    return code;
  };
  const sitiCode = await reservation("Siti Rahma", endsAt);
  const ekoCode = await reservation("Eko Wibowo", new Date(Date.now() - 60_000).toISOString());
  await db.end();
  return { email, sitiCode, ekoCode };
}

test("Scan: Konfirmasi Lunas Cash → Tandai Diambil; reservasi kedaluwarsa → Buat Pesanan Baru", async ({
  page,
}, info) => {
  const { email, sitiCode, ekoCode } = await seed();

  await page.goto(`http://localhost:${PORT}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL(/\/admin\//);
  await page.getByRole("link", { name: "📷 Scan Tiket" }).click();
  await page.waitForURL(/\/scan$/);

  // (h) Tanpa kamera: instruksi + Input Kode Manual tetap tersedia.
  await expect(page.getByRole("button", { name: "Coba Lagi" })).toBeVisible();
  await expect(page.getByTestId("scan-progress")).toContainText("Teater Scan E2E");

  const manual = async (code: string) => {
    await page.getByRole("button", { name: "⌨ Input Kode Manual" }).click();
    await page.getByRole("textbox", { name: "Kode pesanan" }).fill(code.toLowerCase());
    await page.getByRole("button", { name: "Cari" }).click();
  };

  // (d) Cash belum bayar → Konfirmasi Lunas aktif setelah dicentang.
  await manual(sitiCode);
  const panel = page.getByTestId("scan-result");
  await expect(panel).toContainText("💵 BELUM BAYAR (CASH)");
  await expect(panel).toContainText("Rp 150.000");
  const confirm = page.getByRole("button", { name: "Konfirmasi Lunas" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Sudah terima uang").check();
  await confirm.click();

  // (e) → HIJAU, lalu (f) Tandai Diambil.
  await expect(panel).toContainText("✅ LUNAS — siap diambil");
  await expect(panel).toContainText("oleh Rina Scanner");
  await page.screenshot({ path: `test-results/scan-paid-${info.project.name}.png` });
  await page.getByRole("button", { name: "Tandai Tiket Diambil" }).click();
  await expect(page.getByText("Tiket diambil!")).toBeVisible();
  await page.getByRole("button", { name: "Scan Berikutnya" }).click();

  // (g) Scan ulang → SUDAH DIAMBIL oleh admin.
  await manual(sitiCode);
  await expect(panel).toContainText("⛔ SUDAH DIAMBIL");
  await expect(panel).toContainText("oleh Rina Scanner");
  await page.getByRole("button", { name: "Scan Berikutnya" }).click();

  // (k1) Reservasi kedaluwarsa, kuota ada → Buat Pesanan Baru (langsung Lunas).
  await manual(ekoCode);
  await expect(panel).toContainText("⏱ RESERVASI KEDALUWARSA");
  await expect(panel).toContainText("VIP sisa");
  const create = page.getByRole("button", { name: "Buat Pesanan Baru dengan Data Ini" });
  await expect(create).toBeDisabled();
  await page.getByLabel("Sudah terima uang").check();
  await create.click();
  await expect(panel).toContainText("✅ PESANAN BARU — LUNAS");
  await expect(panel).toContainText(`Menggantikan ${ekoCode}`);
  const newCode = (await page.getByTestId("scan-order-code").textContent()) ?? "";
  expect(newCode).not.toBe(ekoCode);
  await page.screenshot({ path: `test-results/scan-reissued-${info.project.name}.png` });
  await page.getByRole("button", { name: "Tandai Tiket Diambil" }).click();
  await expect(page.getByText("Tiket diambil!")).toBeVisible();
  await expect(page.getByTestId("scan-progress")).toContainText("2/2 diambil");

  // (k3) QR/kode lama → sudah dibuatkan pesanan baru.
  await page.getByRole("button", { name: "Scan Berikutnya" }).click();
  await manual(ekoCode);
  await expect(panel).toContainText(`Sudah dibuatkan pesanan baru ${newCode}`);
  await expect(panel).toContainText("✔ Diambil");
  await expect(page.getByRole("button", { name: "Buka Pesanan Baru" })).toBeVisible();
});
