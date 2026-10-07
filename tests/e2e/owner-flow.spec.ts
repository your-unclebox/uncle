import { randomUUID } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

// Alur Owner end-to-end (OWN-01, 04, 07, 08, 09, 10; ADM-01; AC-OWN-01.3).
// Akun Owner uji dibuat langsung di database development (.env).
// Next 16 menyimpan halaman sebelumnya (tersembunyi) di DOM, jadi selector
// dibatasi ke elemen terlihat / tab panel aktif.
const PASSWORD = "e2e-password-123";
const ARGON2ID = 2;

async function createOwner(): Promise<string> {
  const sql = postgres(
    process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54322/uncle_dev",
    {
      max: 1,
      onnotice: () => {},
    },
  );
  const email = `owner-e2e-${randomUUID().slice(0, 8)}@uncle.local`;
  const [user] = await sql<{ id: string }[]>`
    insert into users (email, name, password_hash)
    values (${email}, 'Owner E2E', ${await hash(PASSWORD, { algorithm: ARGON2ID })})
    returning id`;
  await sql`insert into memberships (user_id, role_id) values (${user!.id}, 1)`;
  await sql.end();
  return email;
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
}

test("Owner membuat, melengkapi, dan mempublish event lalu mengundang admin", async ({
  page,
  browser,
}, info) => {
  const ownerEmail = await createOwner();
  const slug = `e2e-${randomUUID().slice(0, 8)}`;

  // AC-OWN-01.2 lalu AC-OWN-01.1
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill("salah-password");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByText("Email atau password salah")).toBeVisible();
  await login(page, ownerEmail);
  await expect(page.getByRole("heading", { name: "Ringkasan Semua Event" })).toBeVisible();

  // AC-OWN-04.1: Draft cukup dengan nama
  await page.getByRole("link", { name: "+ Buat Event" }).first().click();
  await page.getByLabel("Nama Event").filter({ visible: true }).fill("Teater Bagol E2E");
  await page.getByRole("button", { name: "Simpan Draft" }).click();
  await expect(page.getByRole("heading", { name: /Edit Event: Teater Bagol E2E/ })).toBeVisible();
  await expect(page.getByText("○ Draft").filter({ visible: true })).toBeVisible();

  // Info Umum — AC-OWN-04.2: Jam Selesai otomatis +3 jam
  const panel = page.getByRole("tabpanel");
  await panel.getByLabel("Tanggal").fill("2026-12-20");
  await panel.getByLabel("Jam Mulai (WIB)").fill("19:00");
  await expect(panel.getByLabel("Jam Selesai (WIB)")).toHaveValue("22:00");
  await panel.getByLabel("Nama tempat").fill("Gedung Kesenian");
  await page.getByRole("button", { name: "Simpan Draft" }).click();
  await expect(page.getByText("Perubahan disimpan")).toBeVisible();

  // Jenis Tiket (AC-OWN-07.1)
  await page.getByRole("tab", { name: "Jenis Tiket" }).click();
  await panel.getByRole("textbox", { name: "Nama", exact: true }).fill("Reguler");
  await panel.getByLabel("Harga (Rp)").fill("75000");
  await panel.getByLabel("Kuota").fill("150");
  await page.getByRole("button", { name: "Simpan Jenis Tiket" }).click();
  await expect(page.getByRole("cell", { name: "Rp 75.000" })).toBeVisible();

  // Subdomain (AC-OWN-08.1)
  await page.getByRole("tab", { name: "Subdomain" }).click();
  await panel.getByLabel("Slug").fill(slug);
  await expect(page.getByText(`✔ Tersedia — ${slug}.`)).toBeVisible();
  await page.getByRole("button", { name: "Simpan Subdomain" }).click();
  await expect(page.getByText("Subdomain tersimpan")).toBeVisible();

  // Publish (AC-OWN-09.1)
  await expect(page.getByText("✘").filter({ visible: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Simpan & Publish" }).click();
  await expect(page.getByRole("dialog")).toContainText("Publish event?");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("✔ Event dipublikasikan")).toBeVisible();
  await expect(page.getByText("● Aktif").filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({
    path: `test-results/owner-editor-${info.project.name}.png`,
    fullPage: true,
  });

  // Undang admin (AC-OWN-10.1) → aktivasi (AC-ADM-01.1)
  await page.getByRole("tab", { name: "Akses Admin" }).click();
  const adminEmail = `rina-${randomUUID().slice(0, 6)}@teaterbagol.com`;
  await panel.getByLabel("Email").fill(adminEmail);
  await panel.getByRole("textbox", { name: "Nama", exact: true }).fill("Rina");
  await page.getByRole("button", { name: "Kirim Undangan" }).click();
  const inviteUrl = (await page.locator("p.font-mono").textContent()) ?? "";
  expect(inviteUrl).toContain("/undangan/");
  await expect(page.getByText("◌ Diundang")).toBeVisible();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await admin.goto(inviteUrl);
  await expect(admin.getByText("Teater Bagol E2E")).toBeVisible();
  await admin.getByLabel("Password").fill(PASSWORD);
  await admin.getByRole("button", { name: "Aktifkan akun" }).click();
  await expect(admin.getByText("Halo, Rina")).toBeVisible();

  // AC-OWN-01.3: admin membuka area Owner → akses ditolak
  await admin.goto("/owner");
  await expect(admin.getByText("Akses ditolak")).toBeVisible();
  await expect(admin.getByText("Teater Bagol E2E")).toHaveCount(0);
  await adminContext.close();
});
