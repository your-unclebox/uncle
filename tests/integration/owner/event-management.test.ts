import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auditLogs, events, ticketTypes } from "@/server/db/schema";
import { ValidationError } from "@/server/http/validation-error";
import {
  createTicketType,
  deleteTicketType,
  QuotaBelowAllocatedError,
  TicketTypeInUseError,
  TicketTypeNameTakenError,
  updateTicketType,
} from "@/server/modules/catalog";
import {
  checkSlugAvailability,
  createDraftEvent,
  getOwnerSummary,
  getPublishChecklist,
  listOwnerEvents,
  publishEvent,
  PublishChecklistIncompleteError,
  setEventSlug,
  SlugLockedError,
  SlugTakenError,
  toEventForm,
  updateEventDetails,
  VersionConflictError,
} from "@/server/modules/tenancy";
import { withTenant } from "@/server/tenancy";

import { createOrder, useTestDatabase } from "../../fixtures/db";
import { createOwnerUser } from "../../fixtures/identity";
import { checkout } from "../../fixtures/ordering";

const DETAILS = {
  name: 'Teater Bagol — "Nama Lakon"',
  description: "Paragraf deskripsi",
  category: "Teater",
  eventType: "Di lokasi",
  date: "2026-12-20",
  startTime: "19:00",
  endTime: "22:00",
  venueName: "Gedung Kesenian",
  venueAddress: "Jl. Contoh No. 1, Jakarta",
  primaryColor: "#8B1E3F",
};

const uniqueSlug = () => `uji-${crypto.randomUUID().slice(0, 8)}`;

describe("manajemen event oleh Owner (OWN-04 s/d OWN-09)", () => {
  const db = useTestDatabase();

  async function draft() {
    const owner = await createOwnerUser(db);
    const event = await createDraftEvent(db, { name: "Teater Bagol" }, { createdBy: owner.id });
    const tenant = <T>(work: Parameters<typeof withTenant<T>>[2]) =>
      withTenant(db, { eventId: event.id, actorUserId: owner.id }, work);
    return { owner, event, tenant };
  }

  it("AC-OWN-04.1: event baru tersimpan Draft hanya dengan nama", async () => {
    const { event } = await draft();
    expect(event).toMatchObject({ status: "DRAFT", slug: null, startsAt: null, version: 1 });
  });

  it("menyimpan Info Umum: jadwal WIB, deskripsi ter-escape, versi naik", async () => {
    const { event, tenant } = await draft();
    const updated = await tenant((repo) =>
      updateEventDetails(repo, { ...DETAILS, description: "<b>Halo</b>" }, event.version),
    );
    expect(updated.startsAt?.toISOString()).toBe("2026-12-20T12:00:00.000Z");
    expect(updated.endsAt?.toISOString()).toBe("2026-12-20T15:00:00.000Z");
    expect(updated.descriptionHtml).toBe("<p>&lt;b&gt;Halo&lt;/b&gt;</p>");
    expect(updated.version).toBe(2);
    expect(toEventForm(updated)).toMatchObject({
      date: "2026-12-20",
      startTime: "19:00",
      endTime: "22:00",
      timeRange: "19:00–22:00 WIB",
      description: "<b>Halo</b>",
    });
  });

  it("AC-OWN-04.3: jam selesai tidak setelah jam mulai ditolak", async () => {
    const { event, tenant } = await draft();
    const error = await tenant((repo) =>
      updateEventDetails(repo, { ...DETAILS, endTime: "18:00" }, event.version),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).errors).toEqual({
      endTime: ["Jam selesai harus setelah jam mulai"],
    });
  });

  it("If-Match: versi lama → VERSION_CONFLICT", async () => {
    const { event, tenant } = await draft();
    await tenant((repo) => updateEventDetails(repo, DETAILS, event.version));
    await expect(
      tenant((repo) => updateEventDetails(repo, DETAILS, event.version)),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it("AC-OWN-08: slug tersedia / dipakai / format / cadangan", async () => {
    const { tenant } = await draft();
    const other = await draft();
    const slug = uniqueSlug();
    expect(await checkSlugAvailability(db, slug)).toEqual({ available: true });
    await other.tenant((repo) => setEventSlug(repo, { slug }));

    expect(await checkSlugAvailability(db, slug)).toEqual({ available: false, reason: "TAKEN" });
    expect(await checkSlugAvailability(db, "Teater Bagol!")).toEqual({
      available: false,
      reason: "INVALID_FORMAT",
    });
    expect(await checkSlugAvailability(db, "admin")).toEqual({
      available: false,
      reason: "RESERVED",
    });
    await expect(tenant((repo) => setEventSlug(repo, { slug }))).rejects.toBeInstanceOf(
      SlugTakenError,
    );
    await expect(tenant((repo) => setEventSlug(repo, { slug: "admin" }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("BR-EVT-06: slug terkunci setelah ada transaksi", async () => {
    const { event, tenant } = await draft();
    await tenant((repo) => setEventSlug(repo, { slug: uniqueSlug() }));
    await createOrder(db, event.id);
    await expect(
      tenant((repo) => setEventSlug(repo, { slug: uniqueSlug() })),
    ).rejects.toBeInstanceOf(SlugLockedError);
  });

  it("AC-OWN-09.2 & 09.1: publish ditolak bila belum lengkap, lalu berhasil", async () => {
    const { owner, event, tenant } = await draft();
    const error = await tenant((repo) => publishEvent(repo, { actorUserId: owner.id })).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PublishChecklistIncompleteError);
    expect(
      (error as PublishChecklistIncompleteError).items.filter((i) => !i.done).map((i) => i.key),
    ).toEqual(["schedule", "venue", "ticketTypes", "slug"]);

    await tenant(async (repo) => {
      await updateEventDetails(repo, DETAILS, event.version);
      await setEventSlug(repo, { slug: uniqueSlug() });
      await createTicketType(repo, { name: "Reguler", price: 75_000, quota: 150 });
    });
    expect((await tenant((repo) => getPublishChecklist(repo))).every((i) => i.done)).toBe(true);

    const published = await tenant((repo) => publishEvent(repo, { actorUserId: owner.id }));
    expect(published.status).toBe("ACTIVE");
    expect(published.publishedAt).not.toBeNull();
    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, event.id));
    expect(audit?.action).toBe("EVENT_PUBLISHED");
  });

  it("AC-OWN-07: jenis tiket — nama unik, kuota ≥ terjual, hapus vs nonaktif", async () => {
    const { event, tenant } = await draft();
    const reguler = await tenant((repo) =>
      createTicketType(repo, { name: "Reguler", price: 75_000, quota: 150 }),
    );
    await expect(
      tenant((repo) => createTicketType(repo, { name: "Reguler", price: 1, quota: 1 })),
    ).rejects.toBeInstanceOf(TicketTypeNameTakenError);
    await expect(
      tenant((repo) => createTicketType(repo, { name: "Gratis", price: 0, quota: 10 })),
    ).rejects.toBeInstanceOf(ValidationError);

    await db.update(ticketTypes).set({ allocatedCount: 120 }).where(eq(ticketTypes.id, reguler.id));
    const error = await tenant((repo) => updateTicketType(repo, reguler.id, { quota: 100 })).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(QuotaBelowAllocatedError);
    expect((error as Error).message).toBe("Kuota tidak boleh lebih kecil dari tiket terjual (120)");

    // Jenis tiket yang sudah dipesan hanya bisa dinonaktifkan.
    await db.update(ticketTypes).set({ allocatedCount: 0 }).where(eq(ticketTypes.id, reguler.id));
    await db
      .update(events)
      .set({
        status: "ACTIVE",
        slug: uniqueSlug(),
        startsAt: new Date("2026-12-20T12:00:00Z"),
        endsAt: new Date("2026-12-20T15:00:00Z"),
      })
      .where(eq(events.id, event.id));
    await checkout(db, event.id, [{ ticketTypeId: reguler.id, quantity: 1 }]);
    await expect(tenant((repo) => deleteTicketType(repo, reguler.id))).rejects.toBeInstanceOf(
      TicketTypeInUseError,
    );
    const deactivated = await tenant((repo) =>
      updateTicketType(repo, reguler.id, { isActive: false }),
    );
    expect(deactivated.isActive).toBe(false);

    const unused = await tenant((repo) =>
      createTicketType(repo, { name: "VIP", price: 150_000, quota: 50 }),
    );
    await tenant((repo) => deleteTicketType(repo, unused.id));
  });

  it("OWN-02/03: ringkasan & daftar event menghitung tiket terjual", async () => {
    const { event, tenant } = await draft();
    const vip = await tenant((repo) =>
      createTicketType(repo, { name: "VIP", price: 150_000, quota: 50 }),
    );
    await db
      .update(events)
      .set({
        status: "ACTIVE",
        slug: uniqueSlug(),
        startsAt: new Date("2026-12-20T12:00:00Z"),
        endsAt: new Date("2026-12-20T15:00:00Z"),
      })
      .where(eq(events.id, event.id));
    await checkout(db, event.id, [{ ticketTypeId: vip.id, quantity: 2 }]);

    const rows = await listOwnerEvents(db, {}, new Date("2026-12-01T00:00:00Z"));
    expect(rows.find((row) => row.id === event.id)).toMatchObject({
      sold: 2,
      totalQuota: 50,
      status: "ACTIVE",
    });
    const summary = await getOwnerSummary(db, new Date("2026-12-01T00:00:00Z"));
    expect(summary.totalEvents).toBeGreaterThanOrEqual(1);
    expect(summary.ticketsSold).toBeGreaterThanOrEqual(2);
    expect((await listOwnerEvents(db, { q: "tidak-ada-event-ini" })).length).toBe(0);
  });
});
