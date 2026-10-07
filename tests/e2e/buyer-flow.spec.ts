import { randomInt, randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

// Alur pembeli Cash end-to-end di {slug}.uncle.localhost (LP-01, 02, 06, 07,
// 08, 10, 11, 16). Event uji dibuat langsung di database development (.env);
// server dijalankan dengan APP_BASE_DOMAIN=uncle.localhost:3100.
const PORT = 3100;
const DAY = 24 * 60 * 60 * 1000;

const siteUrl = (slug: string, path = "/") => `http://${slug}.uncle.localhost:${PORT}${path}`;

async function createActiveEvent(): Promise<string> {
  const sql = postgres(
    process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54322/uncle_dev",
    { max: 1, onnotice: () => {} },
  );
  const slug = `e2e-buyer-${randomUUID().slice(0, 8)}`;
  // 19:00–22:00 WIB, 30 hari lagi.
  const day = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  const [event] = await sql<{ id: string }[]>`
    insert into events (slug, status, name, starts_at, ends_at, venue_name, venue_address,
                        category, event_type, description_html, primary_color, published_at)
    values (${slug}, 'ACTIVE', 'Teater Bagol E2E', ${`${day}T19:00:00+07:00`},
            ${`${day}T22:00:00+07:00`}, 'Gedung Kesenian', 'Jl. Contoh No. 1, Jakarta',
            'Teater', 'Di lokasi', '<p>Pertunjukan teater komedi.</p>', '#7C3AED', now())
    returning id`;
  await sql`
    insert into ticket_types (event_id, name, price, quota, sort_order) values
      (${event!.id}, 'Reguler', 75000, 150, 1),
      (${event!.id}, 'VIP', 150000, 1, 2)`;
  await sql`
    insert into ticket_types (event_id, name, price, quota, allocated_count, sort_order)
    values (${event!.id}, 'Early Bird', 50000, 20, 20, 0)`;
  await sql.end();
  return slug;
}

const visible = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name }).filter({ visible: true }).first();

test("Pembeli memesan tiket Cash lalu membuka ulang lewat Cek Pesanan", async ({ page }, info) => {
  const slug = await createActiveEvent();
  const phone = `0812${randomInt(10_000_000, 99_999_999)}`;
  const mobile = info.project.name === "mobile";

  // LP-01/02: landing tampil dengan rentang waktu HH:MM–HH:MM WIB.
  await page.goto(siteUrl(slug));
  await expect(page.getByRole("heading", { level: 1, name: "Teater Bagol E2E" })).toBeVisible();
  await expect(page.getByText(/· 19:00–22:00 WIB/).first()).toBeVisible();
  await expect(page.getByTestId("info-jam")).toHaveText("19:00–22:00 WIB");

  // LP-06: Early Bird habis, VIP sisa 1 (stepper berhenti di batas kuota).
  const cards = page.getByTestId("ticket-type-card");
  await expect(cards.filter({ hasText: "Early Bird" })).toContainText("HABIS");
  await expect(page.getByRole("button", { name: "Tambah Early Bird" })).toBeDisabled();
  await page.getByRole("button", { name: "Tambah Reguler" }).click();
  await page.getByRole("button", { name: "Tambah Reguler" }).click();
  await page.getByRole("button", { name: "Tambah VIP" }).click();
  await expect(page.getByRole("button", { name: "Tambah VIP" })).toBeDisabled();
  await expect(page.getByText("Sisa kuota VIP: 1")).toBeVisible();
  if (mobile) {
    await expect(page.getByTestId("sticky-checkout-bar")).toContainText("3 tiket · Rp 300.000");
  } else {
    await expect(page.getByText("Subtotal (3 tiket)")).toBeVisible();
  }
  await visible(page, /Lanjut Isi Data Diri/).click();

  // LP-07: semua field wajib + validasi no HP.
  await expect(page.getByText("Langkah 2 dari 4")).toBeVisible();
  await page.getByRole("button", { name: "Lanjut →" }).click();
  await expect(page.getByText("Wajib diisi")).toHaveCount(3);
  await page.getByLabel("Nama lengkap").fill("Budi Santoso");
  await page.getByLabel("No. HP (WhatsApp)").fill("12345");
  await page.getByLabel("Email").fill("budi@mail.com");
  await page.getByRole("button", { name: "Lanjut →" }).click();
  await expect(page.getByText("Format no HP tidak valid")).toBeVisible();
  await page.getByLabel("No. HP (WhatsApp)").fill(phone);
  await page.getByRole("button", { name: "Lanjut →" }).click();

  // LP-08: QRIS belum terhubung → hanya Cash; label "Pesan Sekarang".
  await expect(page.getByText("Langkah 3 dari 4")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Cash/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /QRIS/ })).toHaveCount(0);
  await expect(page.getByTestId("checkout-total")).toHaveText("Rp 300.000");
  await page.getByRole("button", { name: "Pesan Sekarang →" }).click();

  // LP-10: QR Tiket + kode pesanan + status Belum bayar.
  await expect(page.getByText("✅ Pesanan berhasil dibuat!")).toBeVisible();
  await expect(page.getByRole("img", { name: "QR Tiket" })).toBeVisible();
  const orderCode = (await page.getByTestId("order-code").first().textContent()) ?? "";
  expect(orderCode).toMatch(/^UNC-[0-9A-Z]{6}$/);
  await expect(page.getByText("⏳ Belum bayar")).toBeVisible();
  await expect(page.getByText(/Siapkan uang tunai Rp 300\.000/)).toBeVisible();
  await expect(page.getByText(/sudah dikirim ke email/)).toHaveCount(0);
  await page.screenshot({ path: `test-results/buyer-ticket-${info.project.name}.png` });

  // LP-11: Cek Pesanan — gagal generik, lalu berhasil.
  await page.goto(siteUrl(slug));
  await visible(page, "Cek Pesanan").click();
  await page.getByLabel("Kode Pesanan").fill(orderCode);
  await page.getByLabel("No. HP").fill("081299999999");
  await page.getByRole("button", { name: "Cari Pesanan" }).click();
  await expect(page.getByText("Pesanan tidak ditemukan.")).toBeVisible();
  await page.getByLabel("No. HP").fill(phone);
  await page.getByRole("button", { name: "Cari Pesanan" }).click();
  await expect(page.getByRole("heading", { name: "Pesanan Kamu" })).toBeVisible();
  await expect(page.getByTestId("order-code").filter({ visible: true })).toHaveText(orderCode);
  await expect(page.getByText(/Budi Santoso · 0812\*\*\*\*/)).toBeVisible();
  await expect(page.getByRole("img", { name: "QR Tiket" })).toBeVisible();

  // Kuota VIP berkurang → landing menampilkan HABIS.
  await page.goto(siteUrl(slug));
  await expect(cards.filter({ hasText: "VIP" })).toContainText("HABIS");
});

test("Subdomain tanpa event publik → Event tidak ditemukan (LP-16)", async ({ page }) => {
  await page.goto(siteUrl(`tidak-ada-${randomUUID().slice(0, 6)}`));
  await expect(page.getByRole("heading", { name: "Event tidak ditemukan" })).toBeVisible();
});
