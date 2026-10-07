import { randomBytes, randomUUID } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

// Admin Dashboard + Scan Tiket end-to-end (ADM-03…06, SCN-02…08): ringkasan,
// cari/filter, detail, lalu di Scanner (input kode manual — kamera tidak ada
// di browser uji): Cash → Konfirmasi Lunas → Tandai Diambil, scan ulang →
// Sudah diambil, reservasi kedaluwarsa → Buat Pesanan Baru → Diambil.
const PASSWORD = "e2e-password-123";
const HOUR = 60 * 60 * 1000;

const sql = () =>
  postgres(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54322/uncle_dev", {
    max: 1,
    onnotice: () => {},
  });

const code = () => `UNC-${randomBytes(3).toString("hex").toUpperCase()}`;

// Event sedang berlangsung (mulai 1 jam lalu) dengan 3 pesanan.
async function seed() {
  const db = sql();
  const now = Date.now();
  const [event] = await db<{ id: string }[]>`
    insert into events (slug, status, name, starts_at, ends_at, venue_name, published_at)
    values (${`e2e-adm-${randomUUID().slice(0, 8)}`}, 'ACTIVE', 'Teater Bagol Admin E2E',
            ${new Date(now - HOUR)}, ${new Date(now + 2 * HOUR)}, 'Gedung Kesenian', now())
    returning id`;
  const eventId = event!.id;
  const [reguler] = await db<{ id: string }[]>`
    insert into ticket_types (event_id, name, price, quota, allocated_count, sort_order)
    values (${eventId}, 'Reguler', 75000, 100, 3, 1) returning id`;
  const [vip] = await db<{ id: string }[]>`
    insert into ticket_types (event_id, name, price, quota, allocated_count, sort_order)
    values (${eventId}, 'VIP', 150000, 2, 1, 2) returning id`;

  async function order(o: {
    name: string;
    phone: string;
    method: "QRIS" | "CASH";
    status: "PAID" | "RESERVED";
    expiresAt: Date | null;
    typeId: string;
    typeName: string;
    quantity: number;
    price: number;
  }) {
    const orderCode = code();
    const [row] = await db<{ id: string }[]>`
      insert into orders (event_id, order_code, customer_name, customer_phone, customer_email,
                          payment_method, status, total_amount, expires_at, paid_at, paid_via)
      values (${eventId}, ${orderCode}, ${o.name}, ${o.phone}, 'pembeli@example.com', ${o.method},
              ${o.status}, ${o.price * o.quantity}, ${o.expiresAt},
              ${o.status === "PAID" ? new Date(now - HOUR / 2) : null},
              ${o.status === "PAID" ? "GATEWAY_WEBHOOK" : null})
      returning id`;
    await db`insert into order_items (event_id, order_id, ticket_type_id, quantity, unit_price, ticket_type_name)
             values (${eventId}, ${row!.id}, ${o.typeId}, ${o.quantity}, ${o.price}, ${o.typeName})`;
    await db`insert into tickets (event_id, order_id, qr_fingerprint)
             values (${eventId}, ${row!.id}, ${randomBytes(32)})`;
    return orderCode;
  }

  const budi = await order({
    name: "Budi Santoso",
    phone: "+6281234567890",
    method: "QRIS",
    status: "PAID",
    expiresAt: null,
    typeId: reguler!.id,
    typeName: "Reguler",
    quantity: 2,
    price: 75000,
  });
  const siti = await order({
    name: "Siti Rahma",
    phone: "+6281311221122",
    method: "CASH",
    status: "RESERVED",
    expiresAt: new Date(now + 2 * HOUR),
    typeId: vip!.id,
    typeName: "VIP",
    quantity: 1,
    price: 150000,
  });
  // Reservasi lewat batas 10 menit lalu, belum disapu cron (kuota masih tertahan).
  const andi = await order({
    name: "Andi Pratama",
    phone: "+6285733443344",
    method: "CASH",
    status: "RESERVED",
    expiresAt: new Date(now - 10 * 60 * 1000),
    typeId: reguler!.id,
    typeName: "Reguler",
    quantity: 1,
    price: 75000,
  });

  const email = `admin-scan-${randomUUID().slice(0, 8)}@uncle.local`;
  const [user] = await db<{ id: string }[]>`
    insert into users (email, name, password_hash)
    values (${email}, 'Rina', ${await hash(PASSWORD, { algorithm: 2 })}) returning id`;
  await db`insert into memberships (user_id, role_id, event_id) values (${user!.id}, 2, ${eventId})`;
  await db.end();
  return { eventId, email, budi, siti, andi };
}

async function manualCode(page: Page, orderCode: string) {
  await page.getByRole("button", { name: "⌨ Input Kode Manual" }).first().click();
  await page
    .getByRole("textbox", { name: "Kode Pesanan" })
    .fill(orderCode.replace("UNC-", "").toLowerCase());
  await page.getByRole("button", { name: "Cari" }).click();
}

test("Admin memantau transaksi lalu scan: Konfirmasi Lunas, Diambil, Buat Pesanan Baru", async ({
  page,
}, info) => {
  const { eventId, email, siti, andi } = await seed();
  const mobile = info.project.name === "mobile";
  const panel = page.getByTestId("scan-result");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}$`));

  // ADM-03: Terjual = Lunas + Belum (reservasi lewat batas tidak dihitung).
  await expect(page.getByTestId("summary-terjual")).toContainText("3");
  await expect(page.getByTestId("summary-lunas")).toContainText("2");
  await expect(page.getByTestId("summary-belum")).toContainText("1");
  await expect(page.getByTestId("summary-diambil")).toContainText("0");
  await expect(page.getByText("⚠ QRIS belum aktif")).toBeVisible();

  // ADM-05: klik kartu "Belum" = filter cepat; cari; tidak ada hasil → Reset filter.
  await page.getByTestId("summary-belum").click();
  await expect(page.getByTestId("result-count")).toHaveText("Menampilkan 1 transaksi");
  const rows = page.getByTestId(mobile ? "order-card" : "order-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Siti Rahma");
  await expect(rows.first()).toContainText("⏳ Belum bayar");
  await page.getByRole("searchbox", { name: "Cari transaksi" }).fill("tidak-ada-orang");
  await expect(page.getByText("Tidak ada transaksi yang cocok")).toBeVisible();
  await page.getByRole("button", { name: "Reset filter" }).click();
  await page.getByRole("searchbox", { name: "Cari transaksi" }).fill("0812");
  await expect(page.getByTestId("result-count")).toHaveText("Menampilkan 1 transaksi");

  // ADM-06: detail + no HP lengkap.
  await rows.first().click();
  const drawer = page.getByRole("dialog", { name: "Detail Transaksi" });
  await expect(drawer.getByText("081234567890")).toBeVisible();
  await expect(drawer.getByText("2× Reguler")).toBeVisible();
  await expect(drawer.getByTestId("order-history")).toContainText("Lunas (QRIS, webhook)");
  await page.screenshot({ path: `test-results/admin-dashboard-${info.project.name}.png` });
  await drawer.getByRole("button", { name: "Tutup" }).click();

  // --- Scanner ---
  await page.goto(`/admin/events/${eventId}/scan`);
  await expect(page.getByRole("heading", { name: "Scan Tiket" })).toBeVisible();
  await expect(page.getByTestId("scan-progress")).toHaveText("Teater Bagol Admin E2E · 0/3");
  if (!mobile) await expect(page.getByText("Buka dari HP untuk scan dengan kamera")).toBeVisible();

  // SCN-04: Cash belum bayar → centang → Konfirmasi Lunas → Tandai Diambil.
  await manualCode(page, siti);
  await expect(panel).toHaveAttribute("data-result", "CASH_UNPAID");
  await expect(panel.getByTestId("bill-amount")).toHaveText("Rp 150.000");
  const confirm = panel.getByRole("button", { name: "Konfirmasi Lunas" });
  await expect(confirm).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Tandai Diambil" })).toBeDisabled();
  await panel.getByLabel("Sudah terima uang").check();
  await confirm.click();
  await expect(panel.getByRole("heading")).toHaveText("✅ LUNAS — siap diambil");
  await expect(panel).toContainText("Lunas (Cash, oleh Rina");
  await page.screenshot({ path: `test-results/scan-paid-${info.project.name}.png` });
  await panel.getByRole("button", { name: "Tandai Tiket Diambil" }).click();
  await expect(page.getByTestId("scan-success")).toContainText("Tiket diambil!");
  await expect(page.getByTestId("scan-progress")).toHaveText("Teater Bagol Admin E2E · 1/3");
  await page.getByRole("button", { name: "Scan Berikutnya" }).click();

  // AC-SCN-05.1: scan ulang → Sudah diambil oleh Rina, tanpa aksi.
  await manualCode(page, siti);
  await expect(panel).toHaveAttribute("data-result", "ALREADY_CHECKED_IN");
  await expect(panel).toContainText("oleh Rina");
  await expect(panel.getByRole("button", { name: "Tandai Tiket Diambil" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Scan Berikutnya" }).click();

  // SCN-08: reservasi lewat batas → kuota dilepas → Buat Pesanan Baru (langsung Lunas).
  await manualCode(page, andi);
  await expect(panel).toHaveAttribute("data-result", "RESERVATION_EXPIRED");
  await expect(panel).toContainText("Kuota sudah dilepas otomatis");
  await expect(panel.getByTestId("bill-amount")).toHaveText("Rp 75.000");
  const reissue = panel.getByRole("button", { name: "Buat Pesanan Baru dengan Data Ini" });
  await expect(reissue).toBeDisabled();
  await panel.getByLabel("Sudah terima uang").check();
  await reissue.click();
  await expect(panel.getByRole("heading")).toHaveText("✅ PESANAN BARU — LUNAS");
  const newCode = (await panel.locator(".font-mono").first().textContent()) ?? "";
  expect(newCode).toMatch(/^UNC-[0-9A-Z]{6}$/);
  expect(newCode).not.toBe(andi);
  await page.screenshot({ path: `test-results/scan-reissued-${info.project.name}.png` });
  await panel.getByRole("button", { name: "Tandai Tiket Diambil" }).click();
  await expect(page.getByTestId("scan-success")).toContainText("Andi Pratama");
  await page.getByRole("button", { name: "Scan Berikutnya" }).click();

  // AC-SCN-08.5: QR lama dipindai lagi → info pesanan baru, tanpa pesanan kedua.
  await manualCode(page, andi);
  await expect(panel).toContainText(`Sudah dibuatkan pesanan baru ${newCode} oleh Rina`);
  await expect(panel).toContainText("✔ Diambil");
  await panel.getByRole("button", { name: "Scan Berikutnya" }).click();

  // SCN-06: kode tidak dikenal.
  await manualCode(page, "UNC-ZZZZZZ");
  await expect(panel).toHaveAttribute("data-result", "INVALID");
  await expect(panel).toContainText("Kode tidak ditemukan untuk event ini.");
});
