import { randomBytes, randomUUID } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

// Admin Dashboard (ADM-03..06): Ringkasan → Daftar Transaksi → cari/filter →
// Detail Transaksi dengan riwayat. Data transaksi disiapkan langsung di DB.
const PORT = 3100;
const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "e2e-password-123";

const sql = () =>
  postgres(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54322/uncle_dev", {
    max: 1,
    onnotice: () => {},
  });

async function seedEvent() {
  const db = sql();
  const slug = `e2e-adm-${randomUUID().slice(0, 8)}`;
  const day = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
  const endsAt = `${day}T22:00:00+07:00`;
  const [event] = await db<{ id: string }[]>`
    insert into events (slug, status, name, starts_at, ends_at, venue_name, published_at)
    values (${slug}, 'ACTIVE', 'Teater Admin E2E', ${`${day}T19:00:00+07:00`},
            ${endsAt}, 'Gedung Kesenian', now())
    returning id`;
  const eventId = event!.id;
  // allocated_count = tiket yang dipegang order di bawah (Budi 2 Reguler, Siti 1 VIP).
  const [reguler] = await db<{ id: string }[]>`
    insert into ticket_types (event_id, name, price, quota, allocated_count, sort_order)
    values (${eventId}, 'Reguler', 75000, 100, 2, 0) returning id`;
  const [vip] = await db<{ id: string }[]>`
    insert into ticket_types (event_id, name, price, quota, allocated_count, sort_order)
    values (${eventId}, 'VIP', 150000, 50, 1, 1) returning id`;

  const email = `admin-e2e-${randomUUID().slice(0, 8)}@uncle.local`;
  const [user] = await db<{ id: string }[]>`
    insert into users (email, name, password_hash)
    values (${email}, 'Rina Admin', ${await hash(PASSWORD, { algorithm: 2 })})
    returning id`;
  await db`insert into memberships (user_id, role_id, event_id) values (${user!.id}, 2, ${eventId})`;

  const code = () => `UNC-${randomBytes(3).toString("hex").toUpperCase()}`;
  const budiCode = code();
  const [budi] = await db<{ id: string }[]>`
    insert into orders (event_id, order_code, customer_name, customer_phone, customer_email,
                        payment_method, status, total_amount, paid_at, paid_via, created_at)
    values (${eventId}, ${budiCode}, 'Budi Santoso', '+6281234567890', 'budi@mail.com',
            'QRIS', 'PAID', 150000, now() - interval '1 hour', 'GATEWAY_WEBHOOK',
            now() - interval '2 hours')
    returning id`;
  await db`insert into order_items (event_id, order_id, ticket_type_id, quantity, unit_price, ticket_type_name)
           values (${eventId}, ${budi!.id}, ${reguler!.id}, 2, 75000, 'Reguler')`;
  await db`insert into tickets (event_id, order_id, qr_fingerprint, status, checked_in_at, checked_in_by)
           values (${eventId}, ${budi!.id}, ${randomBytes(32)}, 'CHECKED_IN', now(), ${user!.id})`;

  const sitiCode = code();
  const [siti] = await db<{ id: string }[]>`
    insert into orders (event_id, order_code, customer_name, customer_phone, customer_email,
                        payment_method, status, total_amount, expires_at)
    values (${eventId}, ${sitiCode}, 'Siti Rahma', '+6281311221122', 'siti@mail.com',
            'CASH', 'RESERVED', 150000, ${endsAt})
    returning id`;
  await db`insert into order_items (event_id, order_id, ticket_type_id, quantity, unit_price, ticket_type_name)
           values (${eventId}, ${siti!.id}, ${vip!.id}, 1, 150000, 'VIP')`;
  await db`insert into tickets (event_id, order_id, qr_fingerprint)
           values (${eventId}, ${siti!.id}, ${randomBytes(32)})`;
  await db.end();
  return { eventId, email, sitiCode };
}

const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();

test("Admin melihat ringkasan, mencari & memfilter transaksi, lalu membuka detail", async ({
  page,
}, info) => {
  const { eventId, email, sitiCode } = await seedEvent();

  await page.goto(`http://localhost:${PORT}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL(/\/admin\//);
  await page.goto(`http://localhost:${PORT}/admin/events/${eventId}`);

  // ADM-03: satuan tiket — Terjual = Lunas 2 + Belum 1; Diambil 2.
  await expect(page.getByTestId("summary-terjual")).toHaveText("3");
  await expect(page.getByTestId("summary-lunas")).toHaveText("2");
  await expect(page.getByTestId("summary-belum")).toHaveText("1");
  await expect(page.getByTestId("summary-diambil")).toHaveText("2");

  // ADM-04: kedua transaksi tampil dengan badge status; no HP dimasking.
  await expect(page.getByTestId("transaction-total")).toHaveText("Menampilkan 2 transaksi");
  await expect(visible(page, "Budi Santoso")).toBeVisible();
  await expect(visible(page, "0812****7890")).toBeVisible();
  await expect(visible(page, "⏳ Belum bayar")).toBeVisible();
  await expect(visible(page, "✔ Diambil")).toBeVisible();
  await page.screenshot({ path: `test-results/admin-dashboard-${info.project.name}.png` });

  // ADM-05: klik kartu "Diambil" = filter cepat.
  await page
    .getByRole("button", { name: /Diambil/ })
    .first()
    .click();
  await expect(page.getByTestId("transaction-total")).toHaveText("Menampilkan 1 transaksi");
  await expect(visible(page, "Budi Santoso")).toBeVisible();
  await expect(page.getByText("Siti Rahma").filter({ visible: true })).toHaveCount(0);

  // AC-ADM-05.3: cari tanpa hasil → Reset filter.
  await page.getByLabel("Cari transaksi").fill("tidak-ada-orang");
  await expect(page.getByText("Tidak ada transaksi yang cocok")).toBeVisible();
  await page.getByRole("button", { name: "Reset filter" }).click();
  await expect(page.getByTestId("transaction-total")).toHaveText("Menampilkan 2 transaksi");

  // AC-ADM-05.2: cari sebagian no HP.
  await page.getByLabel("Cari transaksi").fill("0813");
  await expect(page.getByTestId("transaction-total")).toHaveText("Menampilkan 1 transaksi");

  // ADM-06: Detail Transaksi — data lengkap & riwayat.
  await visible(page, "Siti Rahma").click();
  const drawer = page.getByRole("dialog", { name: "Detail Transaksi" });
  await expect(drawer.getByTestId("order-code")).toHaveText(sitiCode);
  await expect(drawer.getByText("081311221122")).toBeVisible();
  await expect(drawer.getByText("siti@mail.com")).toBeVisible();
  await expect(drawer.getByText("1× VIP")).toBeVisible();
  await expect(drawer.getByTestId("order-history")).toContainText("Pesanan dibuat");
  await expect(drawer.getByTestId("order-history")).toContainText("— Belum diambil");
  await page.screenshot({ path: `test-results/admin-detail-${info.project.name}.png` });
  await drawer.getByRole("button", { name: "Tutup" }).click();
  await expect(drawer).toHaveCount(0);
});
